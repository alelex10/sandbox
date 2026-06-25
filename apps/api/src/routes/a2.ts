import { Router, Request, Response, NextFunction } from "express";
import { CreateA2Request } from "shared";
import { createA2, getA2 } from "payments";
import { db } from "../db.js";
import { mpClient, getMpBackUrl } from "../mp.js";
import { tryJsonParse } from "../util.js";

export const a2Router = Router();

// POST /a2 — create a PreApproval with status "authorized" using a card token
a2Router.post("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = CreateA2Request.parse(req.body);

    // externalReference is optional — generate a UUID when omitted
    const externalReference = body.externalReference ?? crypto.randomUUID();

    // Default start_date to tomorrow if not provided (prevents immediate debt)
    const startDate =
      body.autoRecurring.startDate ??
      new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    const result = await createA2(mpClient(), {
      reason: body.reason,
      payerEmail: body.payerEmail,
      externalReference,
      backUrl: getMpBackUrl(),
      cardTokenId: body.cardTokenId,
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
        method: "a2_authorized",
        mpId: result.id ?? null,
        status: result.status ?? null,
        externalReference,
        payerEmail: body.payerEmail,
        reason: body.reason,
        amount: body.autoRecurring.amount,
        currency: body.autoRecurring.currency,
        startDate,
        tokenization: body.tokenization,
        rawCreate: JSON.stringify(result),
      },
    });

    res.status(201).json({
      id: subscription.id,
      method: subscription.method,
      mpId: subscription.mpId,
      status: subscription.status,
      initPoint: subscription.initPoint,
      tokenization: subscription.tokenization,
      rawCreate: result,
      rawLastSearch: null,
      createdAt: subscription.createdAt.toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

// GET /a2 — list all a2_authorized subscriptions with their webhook events
a2Router.get("/", async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const subscriptions = await db.subscription.findMany({
      where: { method: "a2_authorized" },
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
      tokenization: s.tokenization,
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

// GET /a2/:id/mp — fetch live MP state, update rawLastSearch, return result
a2Router.get(
  "/:id/mp",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const subscription = await db.subscription.findUnique({
        where: { id: req.params.id },
      });

      if (!subscription || subscription.method !== "a2_authorized") {
        res.status(404).json({ error: "Subscription not found" });
        return;
      }

      if (!subscription.mpId) {
        res.status(422).json({ error: "Subscription has no mpId to search" });
        return;
      }

      let mpResult: unknown;
      try {
        mpResult = await getA2(mpClient(), subscription.mpId);
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

