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

    const rawCreate = JSON.stringify(result);

    // Atomic: subscription row + initial snapshot created together (M1).
    const subscription = await db.$transaction(async (tx) => {
      const sub = await tx.subscription.create({
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
          rawCreate,
        },
      });
      await tx.subscriptionSnapshot.create({
        data: {
          subscriptionId: sub.id,
          kind: "create",
          statusAtTime: result.status != null ? String(result.status) : null,
          raw: rawCreate,
        },
      });
      return sub;
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
      where: { method: "a2_authorized", deletedAt: null },
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

// DELETE /a2/:id — soft-delete a subscription
a2Router.delete(
  "/:id",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const subscription = await db.subscription.findUnique({
        where: { id: req.params.id },
      });
      if (!subscription || subscription.method !== "a2_authorized") {
        res.status(404).json({ error: "Subscription not found" });
        return;
      }
      if (subscription.deletedAt !== null) {
        res.status(404).json({ error: "Subscription already deleted" });
        return;
      }
      const updated = await db.subscription.update({
        where: { id: req.params.id },
        data: { deletedAt: new Date() },
      });
      res.json({ ok: true, id: updated.id, deletedAt: updated.deletedAt });
    } catch (err) {
      next(err);
    }
  },
);

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

      if (subscription.deletedAt !== null) {
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

      const mpStatus = (mpResult as Record<string, unknown>)?.status;
      const rawSearch = JSON.stringify(mpResult);

      await db.$transaction(async (tx) => {
        await tx.subscription.update({
          where: { id: subscription.id },
          // M2: also sync Subscription.status so sidebar badge reflects latest known state
          data: {
            rawLastSearch: rawSearch,
            status: mpStatus != null ? String(mpStatus) : undefined,
          },
        });
        await tx.subscriptionSnapshot.create({
          data: {
            subscriptionId: subscription.id,
            kind: "search",
            statusAtTime: mpStatus != null ? String(mpStatus) : null,
            raw: rawSearch,
          },
        });
      });

      res.json(mpResult);
    } catch (err) {
      next(err);
    }
  },
);

// GET /a2/:id — detail view: subscription + unified timeline
a2Router.get(
  "/:id",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const subscription = await db.subscription.findUnique({
        where: { id: req.params.id },
        include: {
          snapshots: { orderBy: { createdAt: "asc" } },
          events: { orderBy: { receivedAt: "asc" } },
        },
      });

      if (!subscription || subscription.method !== "a2_authorized" || subscription.deletedAt !== null) {
        res.status(404).json({ error: "Subscription not found" });
        return;
      }

      const timeline = [
        ...subscription.snapshots.map((s) => ({
          id: s.id,
          type: s.kind as "create" | "search",
          label: s.kind === "create" ? "Creación" : "Búsqueda en MP",
          status: s.statusAtTime,
          at: s.createdAt.toISOString(),
          data: tryJsonParse(s.raw),
        })),
        ...subscription.events.map((ev) => ({
          id: ev.id,
          type: "webhook" as const,
          label: ev.topic,
          status: ev.action,
          at: ev.receivedAt.toISOString(),
          data: {
            body: tryJsonParse(ev.rawBody as string | null),
            fetched: tryJsonParse(ev.rawFetched as string | null),
          },
        })),
      ].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());

      res.json({
        id: subscription.id,
        method: subscription.method,
        mpId: subscription.mpId,
        status: subscription.status,
        initPoint: subscription.initPoint,
        tokenization: subscription.tokenization,
        rawCreate: tryJsonParse(subscription.rawCreate),
        rawLastSearch: tryJsonParse(subscription.rawLastSearch),
        createdAt: subscription.createdAt.toISOString(),
        timeline,
      });
    } catch (err) {
      next(err);
    }
  },
);

