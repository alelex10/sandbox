import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import express, { NextFunction, Request, Response } from "express";
import type { Server } from "node:http";
import { ZodError } from "zod";

function zodErrorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    res.status(400).json({ error: "Validation failed", detail: err.issues });
    return;
  }
  res.status(500).json({ error: err instanceof Error ? err.message : "Unknown error" });
}

const { createA2Mock, getA2Mock } = vi.hoisted(() => ({
  createA2Mock: vi.fn(),
  getA2Mock: vi.fn(),
}));
vi.mock("payments", async (importOriginal) => {
  const actual = await importOriginal<typeof import("payments")>();
  return { ...actual, createA2: createA2Mock, getA2: getA2Mock };
});

const { subscriptionCreate, snapshotCreate } = vi.hoisted(() => ({
  subscriptionCreate: vi.fn(),
  snapshotCreate: vi.fn(),
}));
vi.mock("../db.js", () => ({
  db: {
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) =>
      fn({
        subscription: { create: subscriptionCreate },
        subscriptionSnapshot: { create: snapshotCreate },
      }),
    ),
  },
}));

const { getNextSequenceMock, peekNextSequenceMock } = vi.hoisted(() => ({
  getNextSequenceMock: vi.fn(),
  peekNextSequenceMock: vi.fn(),
}));
vi.mock("../lib/sequence.js", () => ({
  getNextSequence: getNextSequenceMock,
  peekNextSequence: peekNextSequenceMock,
}));

const { getMpBackUrlMock, getMpNotificationUrlMock } = vi.hoisted(() => ({
  getMpBackUrlMock: vi.fn(),
  getMpNotificationUrlMock: vi.fn(),
}));
vi.mock("../mp.js", () => ({
  mpClient: vi.fn(() => ({ marker: "mp-client" })),
  getMpBackUrl: getMpBackUrlMock,
  getMpNotificationUrl: getMpNotificationUrlMock,
}));

import { a2Router } from "./a2.js";

// Behavior-preservation ("approval") test for POST /a2 across the
// assembleA2 refactor (Phase 2.8). The real create route must keep
// forwarding the caller's already-tokenized cardTokenId verbatim (no
// placeholder substitution — that only happens in the preview route).
describe("POST /a2", () => {
  let server: Server;
  let baseUrl: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    getNextSequenceMock.mockResolvedValue("0003");
    getMpBackUrlMock.mockReturnValue("https://env.example.com/back");
    getMpNotificationUrlMock.mockReturnValue("https://env.example.com/notify");
    createA2Mock.mockResolvedValue({ id: "mp-id-2", status: "authorized" });
    subscriptionCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      id: "local-sub-2",
      createdAt: new Date("2026-08-18T12:00:00.000Z"),
      ...data,
    }));
    snapshotCreate.mockResolvedValue({});

    const app = express();
    app.use(express.json());
    app.use("/a2", a2Router);
    app.use(zodErrorHandler);
    await new Promise<void>((resolve) => {
      server = app.listen(0, resolve);
    });
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : 0;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("forwards the real cardTokenId verbatim and defaults reason from the sequence", async () => {
    const res = await fetch(`${baseUrl}/a2`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        payerEmail: "payer@example.com",
        cardTokenId: "real-card-token-abc",
        tokenization: "mercadopagojs",
        autoRecurring: { frequency: 1, frequencyType: "months", amount: 1000, currency: "ARS" },
      }),
    });

    expect(res.status).toBe(201);
    const [, input] = createA2Mock.mock.calls[0] as [unknown, Record<string, unknown>];
    expect(input.cardTokenId).toBe("real-card-token-abc");
    expect(input.reason).toBe("A.2 | tokenizacion (mercadopagojs) | card | #0003");

    const [{ data }] = subscriptionCreate.mock.calls[0] as [{ data: Record<string, unknown> }];
    expect(data.tokenization).toBe("mercadopagojs");
    expect(data.reason).toBe(input.reason);
  });
});

// Non-mutating dry-run preview (spec: mp-request-preview). A2's flavor:
// card_token_id MUST always be a placeholder — never a real tokenization.
describe("POST /a2/preview", () => {
  let server: Server;
  let baseUrl: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    peekNextSequenceMock.mockResolvedValue({ next: "0004", current: 3, volatile: true });
    getMpBackUrlMock.mockReturnValue("https://env.example.com/back");
    getMpNotificationUrlMock.mockReturnValue("https://env.example.com/notify");

    const app = express();
    app.use(express.json());
    app.use("/a2", a2Router);
    app.use(zodErrorHandler);
    await new Promise<void>((resolve) => {
      server = app.listen(0, resolve);
    });
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : 0;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("returns a placeholder card_token_id and never calls createA2 (no tokenization)", async () => {
    const res = await fetch(`${baseUrl}/a2/preview`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(200);
    const json = (await res.json()) as { body: Record<string, unknown>; meta: Record<string, unknown> };
    expect(json.body.card_token_id).toBe("generated client-side at submit");
    expect(json.meta.mpCalled).toBe(false);
    expect(createA2Mock).not.toHaveBeenCalled();
    expect(subscriptionCreate).not.toHaveBeenCalled();
  });

  it("ignores a caller-supplied cardTokenId in preview (still forces the placeholder)", async () => {
    const res = await fetch(`${baseUrl}/a2/preview`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cardTokenId: "sneaky-real-looking-token" }),
    });

    const json = (await res.json()) as { body: Record<string, unknown> };
    expect(json.body.card_token_id).toBe("generated client-side at submit");
  });
});
