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

const { createPlanMock, subscribeToPlanMock, getA3SubscriptionMock, getPlanMock, updatePlanMock } = vi.hoisted(() => ({
  createPlanMock: vi.fn(),
  subscribeToPlanMock: vi.fn(),
  getA3SubscriptionMock: vi.fn(),
  getPlanMock: vi.fn(),
  updatePlanMock: vi.fn(),
}));
vi.mock("payments", async (importOriginal) => {
  const actual = await importOriginal<typeof import("payments")>();
  return {
    ...actual,
    createPlan: createPlanMock,
    subscribeToPlan: subscribeToPlanMock,
    getA3Subscription: getA3SubscriptionMock,
    getPlan: getPlanMock,
    updatePlan: updatePlanMock,
  };
});

const { planCreate, planSnapshotCreate, subscriptionCreate, snapshotCreate, planFindFirst } = vi.hoisted(() => ({
  planCreate: vi.fn(),
  planSnapshotCreate: vi.fn(),
  subscriptionCreate: vi.fn(),
  snapshotCreate: vi.fn(),
  planFindFirst: vi.fn(),
}));
vi.mock("../db.js", () => ({
  db: {
    plan: { findFirst: planFindFirst },
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) =>
      fn({
        plan: { create: planCreate },
        planSnapshot: { create: planSnapshotCreate },
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

import { a3Router } from "./a3.js";

// Behavior-preservation ("approval") tests for POST /a3/plans and
// POST /a3/subscribe across the assembleA3Plan / assembleA3Subscribe
// refactor (Phase 2.8).
describe("a3Router create routes", () => {
  let server: Server;
  let baseUrl: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    getNextSequenceMock.mockResolvedValue("0011");
    getMpBackUrlMock.mockReturnValue("https://env.example.com/back");
    getMpNotificationUrlMock.mockReturnValue("https://env.example.com/notify");
    planCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      id: "local-plan-1",
      createdAt: new Date("2026-08-18T12:00:00.000Z"),
      ...data,
    }));
    planSnapshotCreate.mockResolvedValue({});
    subscriptionCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      id: "local-sub-3",
      createdAt: new Date("2026-08-18T12:00:00.000Z"),
      ...data,
    }));
    snapshotCreate.mockResolvedValue({});

    const app = express();
    app.use(express.json());
    app.use("/a3", a3Router);
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

  it("POST /a3/plans defaults back_url from env and forwards reason verbatim", async () => {
    createPlanMock.mockResolvedValue({ id: "mp-plan-1", status: "active", init_point: "https://mp.example.com/plan" });

    const res = await fetch(`${baseUrl}/a3/plans`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reason: "Plan mensual",
        autoRecurring: { frequency: 1, frequencyType: "months", amount: 1000, currency: "ARS" },
      }),
    });

    expect(res.status).toBe(201);
    const [, input] = createPlanMock.mock.calls[0] as [unknown, Record<string, unknown>];
    expect(input.reason).toBe("Plan mensual");
    expect(input.backUrl).toBe("https://env.example.com/back");
  });

  it("POST /a3/subscribe (API path, cardTokenId) defaults reason from the sequence with tokenizacion channel", async () => {
    subscribeToPlanMock.mockResolvedValue({ id: "mp-sub-1", status: "authorized" });

    const res = await fetch(`${baseUrl}/a3/subscribe`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        preapprovalPlanId: "mp-plan-1",
        payerEmail: "payer@example.com",
        externalReference: "ext-ref-1",
        cardTokenId: "card-token-abc",
        tokenization: "mercadopagojs",
      }),
    });

    expect(res.status).toBe(201);
    const [, input] = subscribeToPlanMock.mock.calls[0] as [unknown, Record<string, unknown>];
    expect(input.reason).toBe("A.3 | tokenizacion (mercadopagojs) | card | #0011");
    expect(input.cardTokenId).toBe("card-token-abc");
  });

  it("POST /a3/subscribe (redirect path, no cardTokenId) defaults reason with checkout_pro channel", async () => {
    planFindFirst.mockResolvedValue({
      id: "local-plan-2",
      mpPlanId: "mp-plan-2",
      initPoint: "https://mp.example.com/plan-checkout",
    });

    const res = await fetch(`${baseUrl}/a3/subscribe`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        preapprovalPlanId: "mp-plan-2",
        payerEmail: "payer2@example.com",
        externalReference: "ext-ref-2",
      }),
    });

    expect(res.status).toBe(201);
    const [{ data }] = subscriptionCreate.mock.calls[0] as [{ data: Record<string, unknown> }];
    expect(data.reason).toBe("A.3 | checkout_pro | pending | #0011");
  });
});

// Non-mutating dry-run previews (spec: mp-request-preview). A.3 gets TWO
// preview endpoints — plan-create body and subscribe body — the frontend
// combines both into one "Solicitud MP" view (design decision #4/#5).
describe("a3Router preview routes", () => {
  let server: Server;
  let baseUrl: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    peekNextSequenceMock.mockResolvedValue({ next: "0012", current: 11, volatile: true });
    getMpBackUrlMock.mockReturnValue("https://env.example.com/back");
    getMpNotificationUrlMock.mockReturnValue("https://env.example.com/notify");

    const app = express();
    app.use(express.json());
    app.use("/a3", a3Router);
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

  it("POST /a3/plans/preview returns a defaulted plan body without calling createPlan", async () => {
    const res = await fetch(`${baseUrl}/a3/plans/preview`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(200);
    const json = (await res.json()) as { body: Record<string, unknown>; meta: Record<string, unknown> };
    expect(json.body.reason).toBeTruthy();
    expect(json.body.back_url).toBe("https://env.example.com/back");
    expect(json.meta.flow).toBe("a3-plan");
    expect(createPlanMock).not.toHaveBeenCalled();
    expect(planCreate).not.toHaveBeenCalled();
  });

  it("POST /a3/subscribe/preview returns a defaulted subscribe body without calling subscribeToPlan or writing a Subscription row", async () => {
    const res = await fetch(`${baseUrl}/a3/subscribe/preview`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(200);
    const json = (await res.json()) as { body: Record<string, unknown>; meta: Record<string, unknown> };
    expect(json.body.reason).toContain("#0012");
    expect(json.meta.flow).toBe("a3-subscribe");
    expect(subscribeToPlanMock).not.toHaveBeenCalled();
    expect(subscriptionCreate).not.toHaveBeenCalled();
  });

  it("never burns the sequence counter (peekNextSequence, not getNextSequence)", async () => {
    await fetch(`${baseUrl}/a3/subscribe/preview`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(peekNextSequenceMock).toHaveBeenCalledWith("a3_plan");
    expect(getNextSequenceMock).not.toHaveBeenCalled();
  });
});
