import { Router, Request, Response, NextFunction } from "express";
import { CreateA1Request } from "shared";
import { createA1, getA1 } from "payments";
import { db } from "../db.js";
import { mpClient, getMpBackUrl } from "../mp.js";

export const a1Router = Router();

// POST /a1 — create a PreApproval with status "pending"
a1Router.post("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = CreateA1Request.parse(req.body);

    // externalReference is optional — generate a UUID when omitted
    const externalReference = body.externalReference ?? crypto.randomUUID();

    // Default start_date to tomorrow if not provided (prevents immediate debt)
    const startDate =
      body.autoRecurring.startDate ??
      new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    const result = await createA1(mpClient(), {
      reason: body.reason,
      payerEmail: body.payerEmail,
      externalReference,
      backUrl: getMpBackUrl(),
      autoRecurring: {
        frequency: body.autoRecurring.frequency,
        frequencyType: body.autoRecurring.frequencyType,
        amount: body.autoRecurring.amount,
        currency: body.autoRecurring.currency,
        startDate,
      },
    });

    const subscription = await db.subscription.create({
      data: {
        method: "a1_pending",
        mpId: result.id ?? null,
        status: result.status ?? null,
        externalReference,
        payerEmail: body.payerEmail,
        reason: body.reason,
        amount: body.autoRecurring.amount,
        currency: body.autoRecurring.currency,
        startDate,
        initPoint: result.init_point ?? null,
        rawCreate: JSON.stringify(result),
      },
    });

    res.status(201).json({
      id: subscription.id,
      method: subscription.method,
      mpId: subscription.mpId,
      status: subscription.status,
      initPoint: subscription.initPoint,
      rawCreate: result,
      rawLastSearch: null,
      createdAt: subscription.createdAt.toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

// GET /a1 — list all a1_pending subscriptions with their webhook events
a1Router.get("/", async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const subscriptions = await db.subscription.findMany({
      where: { method: "a1_pending" },
      include: { events: { orderBy: { receivedAt: "desc" } } },
      orderBy: { createdAt: "desc" },
    });

    const result = subscriptions.map((s) => ({
      id: s.id,
      method: s.method,
      mpId: s.mpId,
      status: s.status,
      externalReference: s.externalReference,
      payerEmail: s.payerEmail,
      reason: s.reason,
      amount: s.amount,
      currency: s.currency,
      startDate: s.startDate,
      initPoint: s.initPoint,
      rawCreate: tryJsonParse(s.rawCreate),
      rawLastSearch: tryJsonParse(s.rawLastSearch),
      createdAt: s.createdAt.toISOString(),
      events: s.events.map((ev) => ({
        ...ev,
        rawBody: tryJsonParse(ev.rawBody as string | null),
        rawFetched: tryJsonParse(ev.rawFetched as string | null),
        receivedAt: ev.receivedAt.toISOString(),
      })),
    }));

    res.json(result);
  } catch (err) {
    next(err);
  }
});

// GET /a1/:id/mp — fetch live MP state, update rawLastSearch, return result
a1Router.get(
  "/:id/mp",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const subscription = await db.subscription.findUnique({
        where: { id: req.params.id },
      });

      if (!subscription || subscription.method !== "a1_pending") {
        res.status(404).json({ error: "Subscription not found" });
        return;
      }

      if (!subscription.mpId) {
        res.status(422).json({ error: "Subscription has no mpId to search" });
        return;
      }

      let mpResult: unknown;
      try {
        mpResult = await getA1(mpClient(), subscription.mpId);
      } catch (mpErr) {
        const detail =
          mpErr instanceof Error ? mpErr.message : "Unknown MP error";
        res.status(502).json({ error: "MercadoPago fetch failed", detail });
        return;
      }

      await db.subscription.update({
        where: { id: subscription.id },
        data: { rawLastSearch: JSON.stringify(mpResult) },
      });

      res.json(mpResult);
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function tryJsonParse(value: string | null | undefined): unknown {
  if (value == null) return null;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}
