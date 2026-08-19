import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import express, { NextFunction, Request, Response } from "express";
import type { Server } from "node:http";
import { ZodError } from "zod";

/** Minimal mirror of index.ts's ZodError->400 handler, so preview-route
 * "reject invalid input" tests observe the same status code production does. */
function zodErrorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    res.status(400).json({ error: "Validation failed", detail: err.issues });
    return;
  }
  res.status(500).json({ error: err instanceof Error ? err.message : "Unknown error" });
}

const { createA1Mock, getA1Mock } = vi.hoisted(() => ({
  createA1Mock: vi.fn(),
  getA1Mock: vi.fn(),
}));
vi.mock("payments", async (importOriginal) => {
  // Keep the REAL `buildA1Body` (a pure function the preview route needs)
  // and only mock the MP-calling functions.
  const actual = await importOriginal<typeof import("payments")>();
  return { ...actual, createA1: createA1Mock, getA1: getA1Mock };
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

import { a1Router } from "./a1.js";

// Behavior-preservation ("approval") test for the POST /a1 create route
// across the assembleA1 refactor (Phase 2.8). Locks in: the exact `input`
// handed to `createA1` (payments), and the exact data persisted to the
// Subscription row — both BEFORE and AFTER the route is refactored to
// call `assembleA1` must match.
describe("POST /a1", () => {
  let server: Server;
  let baseUrl: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    getNextSequenceMock.mockResolvedValue("0007");
    getMpBackUrlMock.mockReturnValue("https://env.example.com/back");
    getMpNotificationUrlMock.mockReturnValue("https://env.example.com/notify");
    createA1Mock.mockResolvedValue({ id: "mp-id-1", status: "pending", init_point: "https://mp.example.com/checkout" });
    subscriptionCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      id: "local-sub-1",
      createdAt: new Date("2026-08-18T12:00:00.000Z"),
      ...data,
    }));
    snapshotCreate.mockResolvedValue({});

    const app = express();
    app.use(express.json());
    app.use("/a1", a1Router);
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

  it("defaults reason/startDate/backUrl/notificationUrl and forwards them verbatim to createA1", async () => {
    const res = await fetch(`${baseUrl}/a1`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        payerEmail: "payer@example.com",
        autoRecurring: { frequency: 1, frequencyType: "months", amount: 1000, currency: "ARS" },
      }),
    });

    expect(res.status).toBe(201);
    expect(createA1Mock).toHaveBeenCalledTimes(1);
    const [, input] = createA1Mock.mock.calls[0] as [unknown, Record<string, unknown>];

    expect(input.reason).toBe("A.1 | checkout_pro | pending | #0007");
    expect(input.backUrl).toBe("https://env.example.com/back");
    expect(input.notificationUrl).toBe("https://env.example.com/notify");
    expect(typeof input.externalReference).toBe("string");
    expect((input.externalReference as string).length).toBeGreaterThan(0);
    expect((input.autoRecurring as Record<string, unknown>).startDate).toBeTruthy();

    expect(subscriptionCreate).toHaveBeenCalledTimes(1);
    const [{ data }] = subscriptionCreate.mock.calls[0] as [{ data: Record<string, unknown> }];
    expect(data.method).toBe("a1_pending");
    expect(data.reason).toBe(input.reason);
    expect(data.startDate).toBe((input.autoRecurring as Record<string, unknown>).startDate);
  });

  it("forwards a form-provided reason and backUrl verbatim instead of the defaults", async () => {
    const res = await fetch(`${baseUrl}/a1`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reason: "Custom reason",
        payerEmail: "payer@example.com",
        backUrl: "https://form.example.com/back",
        autoRecurring: { frequency: 1, frequencyType: "months", amount: 1000, currency: "ARS" },
      }),
    });

    expect(res.status).toBe(201);
    const [, input] = createA1Mock.mock.calls[0] as [unknown, Record<string, unknown>];
    expect(input.reason).toBe("Custom reason");
    expect(input.backUrl).toBe("https://form.example.com/back");
  });
});

// Non-mutating dry-run preview (spec: mp-request-preview).
describe("POST /a1/preview", () => {
  let server: Server;
  let baseUrl: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    peekNextSequenceMock.mockResolvedValue({ next: "0009", current: 8, volatile: true });
    getMpBackUrlMock.mockReturnValue("https://env.example.com/back");
    getMpNotificationUrlMock.mockReturnValue("https://env.example.com/notify");

    const app = express();
    app.use(express.json());
    app.use("/a1", a1Router);
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

  it("returns 200 with a fully-defaulted PreviewResponse for a completely empty body", async () => {
    const res = await fetch(`${baseUrl}/a1/preview`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      body: Record<string, unknown>;
      provenance: { path: string }[];
      meta: Record<string, unknown>;
    };
    expect(json.body.payer_email).toBeTruthy();
    expect(json.body.reason).toContain("#0009");
    expect(json.meta).toEqual({
      flow: "a1",
      dryRun: true,
      mpCalled: false,
      dbWritten: false,
      counterIncremented: false,
    });
    expect(json.provenance.some((p) => p.path === "reason")).toBe(true);
  });

  it("never calls createA1 (no MP call) and never writes a Subscription row", async () => {
    await fetch(`${baseUrl}/a1/preview`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(createA1Mock).not.toHaveBeenCalled();
    expect(subscriptionCreate).not.toHaveBeenCalled();
    expect(snapshotCreate).not.toHaveBeenCalled();
  });

  it("peeks the sequence (read-only) instead of burning it", async () => {
    await fetch(`${baseUrl}/a1/preview`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(peekNextSequenceMock).toHaveBeenCalledWith("a1_pending");
    expect(getNextSequenceMock).not.toHaveBeenCalled();
  });

  it("calling preview twice with the same input returns the same peeked sequence", async () => {
    const call = () =>
      fetch(`${baseUrl}/a1/preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }).then((r) => r.json()) as Promise<{ body: Record<string, unknown> }>;

    const first = await call();
    const second = await call();
    expect(first.body.reason).toBe(second.body.reason);
  });

  it("rejects invalid input consistent with the real route", async () => {
    const res = await fetch(`${baseUrl}/a1/preview`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payerEmail: "not-an-email" }),
    });

    expect(res.status).toBe(400);
  });
});
