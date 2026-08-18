import { Router, Request, Response, NextFunction } from "express";
import { CreateA1Request } from "shared";
import { buildDefaultReason } from "shared";
import { createA1, getA1 } from "payments";
import { db } from "../db.js";
import { mpClient, getMpBackUrl, getMpNotificationUrl } from "../mp.js";
import { tryJsonParse } from "../util.js";
import { paginate, parsePagination } from "../lib/pagination.js";
import { getNextSequence } from "../lib/sequence.js";

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

    // Compose effective reason: user override wins if non-empty, otherwise
    // compose a default from the route shape. The counter ALWAYS advances
    // (per locked decision), even when the user's reason wins.
    const seq = await getNextSequence("a1_pending");
    const userReason = body.reason?.trim() ?? "";
    const effectiveReason =
      userReason !== ""
        ? userReason
        : buildDefaultReason({
            type: "A.1",
            channel: "checkout_pro",
            paymentMethod: "pending",
            seq,
          });

    const result = await createA1(mpClient(), {
      reason: effectiveReason,
      payerEmail: body.payerEmail,
      externalReference,
      backUrl: body.backUrl ?? getMpBackUrl(),
      notificationUrl: getMpNotificationUrl(),
      autoRecurring: {
        frequency: body.autoRecurring.frequency,
        frequencyType: body.autoRecurring.frequencyType,
        amount: body.autoRecurring.amount,
        currency: body.autoRecurring.currency,
        startDate,
        ...(body.autoRecurring.endDate !== undefined
          ? { endDate: body.autoRecurring.endDate }
          : {}),
        ...(body.autoRecurring.freeTrial !== undefined
          ? { freeTrial: body.autoRecurring.freeTrial }
          : {}),
        ...(body.autoRecurring.repetitions !== undefined
          ? { repetitions: body.autoRecurring.repetitions }
          : {}),
      },
    });

    const rawCreate = JSON.stringify(result);

    // Atomic: subscription row + initial snapshot created together (M1).
    const subscription = await db.$transaction(async (tx) => {
      const sub = await tx.subscription.create({
        data: {
          method: "a1_pending",
          mpId: result.id ?? null,
          status: result.status ?? null,
          externalReference,
          payerEmail: body.payerEmail,
          reason: effectiveReason,
          amount: body.autoRecurring.amount,
          currency: body.autoRecurring.currency,
          startDate,
          initPoint: result.init_point ?? null,
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
      rawCreate: result,
      rawLastSearch: null,
      createdAt: subscription.createdAt.toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

// GET /a1 — list all a1_pending subscriptions (paginated)
a1Router.get("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { page, limit } = parsePagination(req.query);
    const envelope = await paginate(
      db.subscription,
      {
        where: { method: "a1_pending", deletedAt: null },
        orderBy: { createdAt: "desc" },
      },
      { page, limit },
    );

    res.json({
      ...envelope,
      items: envelope.items.map((s) => ({
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
      })),
    });
  } catch (err) {
    next(err);
  }
});

// DELETE /a1 — bulk soft-delete all a1_pending subscriptions
a1Router.delete("/", async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await db.subscription.updateMany({
      where: { method: "a1_pending", deletedAt: null },
      data: { deletedAt: new Date() },
    });
    res.json({ ok: true, count: result.count });
  } catch (err) {
    next(err);
  }
});

// DELETE /a1/:id — soft-delete a subscription
a1Router.delete(
  "/:id",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const subscription = await db.subscription.findUnique({
        where: { id: req.params.id },
      });
      if (!subscription || subscription.method !== "a1_pending") {
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
        mpResult = await getA1(mpClient(), subscription.mpId);
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

// GET /a1/:id — detail view: subscription + unified timeline
a1Router.get(
  "/:id",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const subscription = await db.subscription.findUnique({
        where: { id: req.params.id },
        include: {
          snapshots: { orderBy: { createdAt: "asc" } },
          events: { where: { deletedAt: null }, orderBy: { receivedAt: "asc" } },
        },
      });

      if (!subscription || subscription.method !== "a1_pending" || subscription.deletedAt !== null) {
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
      ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

      res.json({
        id: subscription.id,
        method: subscription.method,
        mpId: subscription.mpId,
        status: subscription.status,
        initPoint: subscription.initPoint,
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

