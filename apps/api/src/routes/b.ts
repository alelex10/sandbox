import { Router, Request, Response, NextFunction } from "express";
import { CreatePaymentProfileRequest, ChargeOrderRequest } from "shared";
import { createPaymentProfile, chargeOrder } from "payments";
import { db } from "../db.js";
import { env } from "../config.js";
import { tryJsonParse } from "../util.js";

export const bRouter = Router();

// POST /b/profiles — register a card as a stored payment method (payment profile)
bRouter.post("/profiles", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = CreatePaymentProfileRequest.parse(req.body);

    let mpResult: unknown;
    try {
      mpResult = await createPaymentProfile({
        accessToken: env.MP_ACCESS_TOKEN,
        cardToken: body.cardTokenId,
        paymentMethodId: body.paymentMethodId,
        cardType: body.cardType,
      });
    } catch (mpErr) {
      const detail = mpErr instanceof Error ? mpErr.message : "Unknown MP error";
      res.status(502).json({ error: "MercadoPago payment profile creation failed", detail });
      return;
    }

    // Log raw response for debugging — Orders/profiles API is not SDK-covered
    console.log("[b/profiles] MP raw response:", JSON.stringify(mpResult));

    // Extract key fields from the raw MP response
    const raw = mpResult as Record<string, unknown>;
    const paymentProfileId = typeof raw.id === "string" ? raw.id : null;
    const mpStatus = typeof raw.status === "string" ? raw.status : null;
    const customerId =
      typeof raw.customer_id === "string" ? raw.customer_id : null;

    if (!paymentProfileId) {
      res.status(502).json({
        error: "MercadoPago payment profile creation returned no id",
        detail: JSON.stringify(mpResult).slice(0, 400),
      });
      return;
    }

    // Generate externalReference so MP webhook enrichment can attribute
    // payment/order events back to this B subscription via external_reference.
    const externalReference = crypto.randomUUID();
    const snapshotRaw = JSON.stringify(mpResult);

    // Atomic: subscription row + initial snapshot created together (M1).
    const subscription = await db.$transaction(async (tx) => {
      const sub = await tx.subscription.create({
        data: {
          method: "b_orders",
          status: mpStatus,
          externalReference,
          paymentProfileId,
          customerId,
          tokenization: body.tokenization,
          // amount and currency are per-charge for B; no fixed recurring amount here
          amount: 0,
          currency: "ARS",
          rawCreate: snapshotRaw,
        },
      });
      await tx.subscriptionSnapshot.create({
        data: {
          subscriptionId: sub.id,
          kind: "create",
          statusAtTime: mpStatus != null ? String(mpStatus) : null,
          raw: snapshotRaw,
        },
      });
      return sub;
    });

    res.status(201).json({
      id: subscription.id,
      method: subscription.method,
      status: subscription.status,
      paymentProfileId: subscription.paymentProfileId,
      customerId: subscription.customerId,
      tokenization: subscription.tokenization,
      rawCreate: mpResult,
      createdAt: subscription.createdAt.toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

// POST /b/charge — trigger a charge against a stored payment profile
bRouter.post("/charge", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = ChargeOrderRequest.parse(req.body);

    // Load the subscription — must be b_orders method with a valid payment profile
    const subscription = await db.subscription.findUnique({
      where: { id: body.subscriptionId },
    });

    if (!subscription) {
      res.status(404).json({ error: "Subscription not found" });
      return;
    }

    if (subscription.method !== "b_orders") {
      res.status(400).json({
        error: "Subscription is not a b_orders subscription",
        detail: `Expected method=b_orders, got method=${subscription.method}`,
      });
      return;
    }

    if (subscription.deletedAt !== null) {
      res.status(404).json({ error: "Subscription not found" });
      return;
    }

    if (!subscription.paymentProfileId) {
      res.status(400).json({
        error: "Subscription has no paymentProfileId — cannot charge",
        detail: "The subscription profile creation may have failed or not completed.",
      });
      return;
    }

    if (!subscription.customerId) {
      res.status(400).json({
        error: "Subscription has no customerId — cannot charge",
        detail: "The subscription profile creation may have failed or not completed.",
      });
      return;
    }

    // Use the subscription's stored externalReference so MP echoes it back on
    // order/payment webhooks and the enrichment path can attribute them (H1).
    const externalReference = subscription.externalReference ?? `charge-${subscription.id}-${Date.now()}`;

    let mpResult: unknown;
    try {
      mpResult = await chargeOrder({
        accessToken: env.MP_ACCESS_TOKEN,
        customerId: subscription.customerId,
        paymentProfileId: subscription.paymentProfileId,
        amount: body.amount,
        externalReference,
        sequenceNumber: body.sequenceNumber,
        ...(body.processingMode !== undefined
          ? { processingMode: body.processingMode }
          : {}),
        ...(body.retries !== undefined ? { retries: body.retries } : {}),
        ...(body.sequenceTotal !== undefined
          ? { sequenceTotal: body.sequenceTotal }
          : {}),
        ...(body.subscriptionMpId !== undefined
          ? { subscriptionMpId: body.subscriptionMpId }
          : {}),
        ...(body.invoiceId !== undefined
          ? { invoiceId: body.invoiceId }
          : {}),
        ...(body.invoiceBillingDate !== undefined
          ? { invoiceBillingDate: body.invoiceBillingDate }
          : {}),
        ...(body.invoicePeriodInterval !== undefined
          ? { invoicePeriodInterval: body.invoicePeriodInterval }
          : {}),
        ...(body.invoicePeriodType !== undefined
          ? { invoicePeriodType: body.invoicePeriodType }
          : {}),
        ...(body.firstPayment !== undefined
          ? { firstPayment: body.firstPayment }
          : {}),
        ...(body.previousTransactionReference !== undefined
          ? { previousTransactionReference: body.previousTransactionReference }
          : {}),
        ...(body.description !== undefined
          ? { description: body.description }
          : {}),
      });
    } catch (mpErr) {
      const detail = mpErr instanceof Error ? mpErr.message : "Unknown MP error";
      res.status(502).json({ error: "MercadoPago charge failed", detail });
      return;
    }

    // Log raw response — Orders API response shape may vary
    console.log("[b/charge] MP raw response:", JSON.stringify(mpResult));

    const rawOrder = mpResult as Record<string, unknown>;
    const mpOrderId = typeof rawOrder.id === "string" ? rawOrder.id : null;
    const chargeStatus = typeof rawOrder.status === "string" ? rawOrder.status : null;

    const charge = await db.orderCharge.create({
      data: {
        subscriptionId: subscription.id,
        mpOrderId,
        amount: body.amount,
        status: chargeStatus,
        sequenceNumber: body.sequenceNumber ?? null,
        rawResponse: JSON.stringify(mpResult),
      },
    });

    res.status(201).json({
      id: charge.id,
      subscriptionId: charge.subscriptionId,
      mpOrderId: charge.mpOrderId,
      amount: charge.amount,
      status: charge.status,
      sequenceNumber: charge.sequenceNumber,
      rawResponse: mpResult,
      createdAt: charge.createdAt.toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

// GET /b — list all b_orders subscriptions with their charges and webhook events
bRouter.get("/", async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const subscriptions = await db.subscription.findMany({
      where: { method: "b_orders", deletedAt: null },
      include: {
        charges: { orderBy: { createdAt: "desc" } },
        events: { orderBy: { receivedAt: "desc" } },
      },
      orderBy: { createdAt: "desc" },
    });

    const result = subscriptions.map((s) => ({
      id: s.id,
      method: s.method,
      status: s.status,
      paymentProfileId: s.paymentProfileId,
      customerId: s.customerId,
      tokenization: s.tokenization,
      rawCreate: tryJsonParse(s.rawCreate),
      createdAt: s.createdAt.toISOString(),
      charges: s.charges.map((c) => ({
        id: c.id,
        mpOrderId: c.mpOrderId,
        amount: c.amount,
        status: c.status,
        sequenceNumber: c.sequenceNumber,
        rawResponse: tryJsonParse(c.rawResponse),
        createdAt: c.createdAt.toISOString(),
      })),
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

// DELETE /b — bulk soft-delete all b_orders subscriptions
bRouter.delete("/", async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await db.subscription.updateMany({
      where: { method: "b_orders", deletedAt: null },
      data: { deletedAt: new Date() },
    });
    res.json({ ok: true, count: result.count });
  } catch (err) {
    next(err);
  }
});

// DELETE /b/:id — soft-delete a b_orders subscription
bRouter.delete(
  "/:id",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const subscription = await db.subscription.findUnique({
        where: { id: req.params.id },
      });
      if (!subscription || subscription.method !== "b_orders") {
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

// GET /b/:id — detail view: subscription + unified timeline (snapshots + webhooks + charges)
// Express /:id only matches one path segment so /:id/charges is not shadowed by this route
bRouter.get(
  "/:id",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const subscription = await db.subscription.findUnique({
        where: { id: req.params.id },
        include: {
          snapshots: { orderBy: { createdAt: "asc" } },
          charges: { orderBy: { createdAt: "asc" } },
          events: { orderBy: { receivedAt: "asc" } },
        },
      });

      if (!subscription || subscription.method !== "b_orders" || subscription.deletedAt !== null) {
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
        ...subscription.charges.map((c) => ({
          id: c.id,
          type: "charge" as const,
          label: "Cobro",
          status: c.status,
          at: c.createdAt.toISOString(),
          data: tryJsonParse(c.rawResponse),
        })),
      ].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());

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

// GET /b/:id/charges — list all OrderCharge rows for a subscription
bRouter.get("/:id/charges", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const subscription = await db.subscription.findUnique({
      where: { id: req.params.id },
    });

    if (!subscription || subscription.method !== "b_orders" || subscription.deletedAt !== null) {
      res.status(404).json({ error: "B subscription not found" });
      return;
    }

    const charges = await db.orderCharge.findMany({
      where: { subscriptionId: req.params.id },
      orderBy: { createdAt: "desc" },
    });

    const result = charges.map((c) => ({
      id: c.id,
      subscriptionId: c.subscriptionId,
      mpOrderId: c.mpOrderId,
      amount: c.amount,
      status: c.status,
      sequenceNumber: c.sequenceNumber,
      rawResponse: tryJsonParse(c.rawResponse),
      createdAt: c.createdAt.toISOString(),
    }));

    res.json(result);
  } catch (err) {
    next(err);
  }
});
