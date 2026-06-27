import { Router, Request, Response, NextFunction } from "express";
import { CreatePlanRequest, SubscribeToPlanRequest } from "shared";
import { createPlan, subscribeToPlan, getA3Subscription, getPlan } from "payments";
import { db } from "../db.js";
import { mpClient, getMpBackUrl } from "../mp.js";
import { tryJsonParse } from "../util.js";

export const a3Router = Router();

// ---------------------------------------------------------------------------
// Plan routes — registered BEFORE generic /:id routes to avoid shadowing
// ---------------------------------------------------------------------------

// GET /a3/plans — list all Plan rows (parse-on-read for rawCreate)
a3Router.get("/plans", async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const plans = await db.plan.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: "desc" },
    });

    const result = plans.map((p) => ({
      id: p.id,
      mpPlanId: p.mpPlanId,
      reason: p.reason,
      amount: p.amount,
      currency: p.currency,
      frequency: p.frequency,
      frequencyType: p.frequencyType,
      initPoint: p.initPoint,
      rawCreate: tryJsonParse(p.rawCreate),
      rawLastSearch: tryJsonParse(p.rawLastSearch),
      createdAt: p.createdAt.toISOString(),
    }));

    res.json(result);
  } catch (err) {
    next(err);
  }
});

// DELETE /a3/plans — bulk soft-delete all plans (registered before /plans/:id)
a3Router.delete("/plans", async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await db.plan.updateMany({
      where: { deletedAt: null },
      data: { deletedAt: new Date() },
    });
    res.json({ ok: true, count: result.count });
  } catch (err) {
    next(err);
  }
});

// DELETE /a3/plans/:id — soft-delete a plan
a3Router.delete(
  "/plans/:id",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const plan = await db.plan.findUnique({
        where: { id: req.params.id },
      });
      if (!plan) {
        res.status(404).json({ error: "Plan not found" });
        return;
      }
      if (plan.deletedAt !== null) {
        res.status(404).json({ error: "Plan already deleted" });
        return;
      }
      const updated = await db.plan.update({
        where: { id: req.params.id },
        data: { deletedAt: new Date() },
      });
      res.json({ ok: true, id: updated.id, deletedAt: updated.deletedAt });
    } catch (err) {
      next(err);
    }
  },
);

// GET /a3/plans/:id/mp — fetch live MP state for a plan, append PlanSnapshot kind='search'
a3Router.get(
  "/plans/:id/mp",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const plan = await db.plan.findUnique({
        where: { id: req.params.id },
      });

      if (!plan) {
        res.status(404).json({ error: "Plan not found" });
        return;
      }

      if (plan.deletedAt !== null) {
        res.status(404).json({ error: "Plan not found" });
        return;
      }

      if (!plan.mpPlanId) {
        res.status(422).json({ error: "Plan has no mpPlanId to search" });
        return;
      }

      let mpResult: unknown;
      try {
        mpResult = await getPlan(mpClient(), plan.mpPlanId);
      } catch (mpErr) {
        const detail =
          mpErr instanceof Error ? mpErr.message : "Unknown MP error";
        res.status(502).json({ error: "MercadoPago fetch failed", detail });
        return;
      }

      const mpStatus = (mpResult as unknown as Record<string, unknown>)?.status;
      const rawSearch = JSON.stringify(mpResult);

      await db.$transaction(async (tx) => {
        await tx.plan.update({
          where: { id: plan.id },
          data: {
            rawLastSearch: rawSearch,
          },
        });
        await tx.planSnapshot.create({
          data: {
            planId: plan.id,
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

// GET /a3/plans/:id — plan detail with unified timeline
a3Router.get(
  "/plans/:id",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const plan = await db.plan.findUnique({
        where: { id: req.params.id },
        include: {
          snapshots: { orderBy: { createdAt: "asc" } },
        },
      });

      if (!plan) {
        res.status(404).json({ error: "Plan not found" });
        return;
      }

      if (plan.deletedAt !== null) {
        res.status(404).json({ error: "Plan not found" });
        return;
      }

      // Attribute plan webhooks: WebhookEvent where category='plan' AND mpResourceId=plan.mpPlanId
      const webhookEvents = plan.mpPlanId
        ? await db.webhookEvent.findMany({
            where: {
              category: "plan",
              mpResourceId: plan.mpPlanId,
            },
            orderBy: { receivedAt: "asc" },
          })
        : [];

      const timeline = [
        ...plan.snapshots.map((s) => ({
          id: s.id,
          type: s.kind as "create" | "search",
          label: s.kind === "create" ? "Creación del plan" : "Búsqueda del plan en MP",
          status: s.statusAtTime,
          at: s.createdAt.toISOString(),
          data: tryJsonParse(s.raw),
        })),
        ...webhookEvents.map((ev) => ({
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
        id: plan.id,
        mpPlanId: plan.mpPlanId,
        reason: plan.reason,
        amount: plan.amount,
        currency: plan.currency,
        frequency: plan.frequency,
        frequencyType: plan.frequencyType,
        initPoint: plan.initPoint,
        rawCreate: tryJsonParse(plan.rawCreate),
        rawLastSearch: tryJsonParse(plan.rawLastSearch),
        createdAt: plan.createdAt.toISOString(),
        timeline,
      });
    } catch (err) {
      next(err);
    }
  },
);

// POST /a3/plans — create a PreApprovalPlan template
a3Router.post("/plans", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = CreatePlanRequest.parse(req.body);

    const result = await createPlan(mpClient(), {
      reason: body.reason,
      backUrl: body.backUrl ?? getMpBackUrl(),
      autoRecurring: {
        frequency: body.autoRecurring.frequency,
        frequencyType: body.autoRecurring.frequencyType,
        amount: body.autoRecurring.amount,
        currency: body.autoRecurring.currency,
        ...(body.billingDay !== undefined
          ? { billingDay: body.billingDay }
          : {}),
        ...(body.billingDayProportional !== undefined
          ? { billingDayProportional: body.billingDayProportional }
          : {}),
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
      ...(body.paymentMethodsAllowed !== undefined
        ? { paymentMethodsAllowed: body.paymentMethodsAllowed }
        : {}),
    });

    // Guard against missing mpPlanId — do not persist a null plan id
    const mpPlanId = (result as { id?: string }).id ?? null;
    if (!mpPlanId) {
      const safeDetail =
        typeof result === "object" && result !== null
          ? JSON.stringify(result).slice(0, 400)
          : String(result);
      res.status(502).json({
        error: "MercadoPago plan creation returned no id",
        detail: safeDetail,
      });
      return;
    }

    // Prefer billing fields from MP auto_recurring; fall back to request body
    const mpAutoRecurring = (result as { auto_recurring?: Record<string, unknown> }).auto_recurring;
    const amount =
      typeof mpAutoRecurring?.transaction_amount === "number"
        ? mpAutoRecurring.transaction_amount
        : body.autoRecurring.amount;
    const currency =
      typeof mpAutoRecurring?.currency_id === "string"
        ? mpAutoRecurring.currency_id
        : body.autoRecurring.currency;
    const frequency =
      typeof mpAutoRecurring?.frequency === "number"
        ? mpAutoRecurring.frequency
        : body.autoRecurring.frequency;
    const frequencyType =
      typeof mpAutoRecurring?.frequency_type === "string"
        ? mpAutoRecurring.frequency_type
        : body.autoRecurring.frequencyType;

    const mpStatus = (result as unknown as Record<string, unknown>)?.status;
    const rawCreate = JSON.stringify(result);

    // Atomic: plan row + initial snapshot created together (mirrors M1 pattern)
    const plan = await db.$transaction(async (tx) => {
      const p = await tx.plan.create({
        data: {
          mpPlanId,
          reason: body.reason,
          amount,
          currency,
          frequency,
          frequencyType,
          initPoint: (result as { init_point?: string }).init_point ?? null,
          rawCreate,
        },
      });
      await tx.planSnapshot.create({
        data: {
          planId: p.id,
          kind: "create",
          statusAtTime: mpStatus != null ? String(mpStatus) : null,
          raw: rawCreate,
        },
      });
      return p;
    });

    res.status(201).json({
      id: plan.id,
      mpPlanId: plan.mpPlanId,
      reason: plan.reason,
      amount: plan.amount,
      currency: plan.currency,
      frequency: plan.frequency,
      frequencyType: plan.frequencyType,
      initPoint: plan.initPoint,
      rawCreate: result,
      rawLastSearch: null,
      createdAt: plan.createdAt.toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Subscription routes (A.3 PreApproval subscriptions linked to a plan)
// ---------------------------------------------------------------------------

// POST /a3/subscribe — subscribe a payer to a plan
// Two paths:
//   - With cardTokenId: call MP PreApproval.create via API and persist Subscription
//   - Without cardTokenId: init_point redirect path — look up Plan's initPoint and return it
a3Router.post("/subscribe", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = SubscribeToPlanRequest.parse(req.body);

    if (body.cardTokenId) {
      // API path — create a linked PreApproval directly via MP SDK
      const result = await subscribeToPlan(mpClient(), {
        preapprovalPlanId: body.preapprovalPlanId,
        payerEmail: body.payerEmail,
        externalReference: body.externalReference,
        cardTokenId: body.cardTokenId,
        backUrl: body.backUrl ?? getMpBackUrl(),
        ...(body.reason !== undefined ? { reason: body.reason } : {}),
        ...(body.autoRecurring !== undefined ? { autoRecurring: body.autoRecurring } : {}),
      });

      const rawCreate = JSON.stringify(result);
      const resultStatus = (result as { status?: string }).status;

      // Atomic: subscription row + initial snapshot created together (M1).
      const subscription = await db.$transaction(async (tx) => {
        const sub = await tx.subscription.create({
          data: {
            method: "a3_plan",
            mpId: (result as { id?: string }).id ?? null,
            // Persist whatever status MP returns — do not assume "authorized"
            status: resultStatus ?? null,
            externalReference: body.externalReference,
            payerEmail: body.payerEmail,
            preapprovalPlanId: body.preapprovalPlanId,
            tokenization: body.tokenization ?? null,
            // A.3 API subscriptions do not carry amount/currency directly — plan holds them
            amount: 0,
            currency: "ARS",
            rawCreate,
          },
        });
        await tx.subscriptionSnapshot.create({
          data: {
            subscriptionId: sub.id,
            kind: "create",
            statusAtTime: resultStatus != null ? String(resultStatus) : null,
            raw: rawCreate,
          },
        });
        return sub;
      });

      res.status(201).json({
        path: "api",
        id: subscription.id,
        method: subscription.method,
        mpId: subscription.mpId,
        status: subscription.status,
        preapprovalPlanId: subscription.preapprovalPlanId,
        tokenization: subscription.tokenization,
        initPoint: null,
        rawCreate: result,
        rawLastSearch: null,
        createdAt: subscription.createdAt.toISOString(),
      });
    } else {
      // Redirect path — look up the Plan to get its initPoint
      const plan = await db.plan.findFirst({
        where: { mpPlanId: body.preapprovalPlanId },
        orderBy: { createdAt: "desc" },
      });

      // Guard — do not persist Subscription when plan is missing or has no initPoint
      if (!plan || !plan.initPoint) {
        res.status(404).json({
          error: "Plan not found for redirect",
          detail: `No plan with mpPlanId "${body.preapprovalPlanId}" found, or plan has no initPoint.`,
        });
        return;
      }

      const initPoint = plan.initPoint;

      // Persist a Subscription record to track this redirect-based subscription attempt
      // Atomic: subscription row + initial snapshot created together (M1).
      const subscription = await db.$transaction(async (tx) => {
        const sub = await tx.subscription.create({
          data: {
            method: "a3_plan",
            mpId: null,
            status: "pending_redirect",
            externalReference: body.externalReference,
            payerEmail: body.payerEmail,
            preapprovalPlanId: body.preapprovalPlanId,
            initPoint,
            amount: 0,
            currency: "ARS",
            rawCreate: null,
          },
        });
        await tx.subscriptionSnapshot.create({
          data: {
            subscriptionId: sub.id,
            kind: "create",
            statusAtTime: "pending_redirect",
            raw: "{}",
          },
        });
        return sub;
      });

      res.status(201).json({
        path: "redirect",
        id: subscription.id,
        method: subscription.method,
        mpId: null,
        status: subscription.status,
        preapprovalPlanId: subscription.preapprovalPlanId,
        initPoint,
        tokenization: null,
        rawCreate: null,
        rawLastSearch: null,
        createdAt: subscription.createdAt.toISOString(),
        message: "Redirect the payer to initPoint to complete subscription.",
      });
    }
  } catch (err) {
    next(err);
  }
});

// DELETE /a3 — bulk soft-delete all a3_plan subscriptions
a3Router.delete("/", async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await db.subscription.updateMany({
      where: { method: "a3_plan", deletedAt: null },
      data: { deletedAt: new Date() },
    });
    res.json({ ok: true, count: result.count });
  } catch (err) {
    next(err);
  }
});

// DELETE /a3/:id — soft-delete an a3_plan subscription
a3Router.delete(
  "/:id",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const subscription = await db.subscription.findUnique({
        where: { id: req.params.id },
      });
      if (!subscription || subscription.method !== "a3_plan") {
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

// GET /a3/:id/mp — fetch live MP state for a subscription, update rawLastSearch, return result
// Registered BEFORE /:id to avoid shadowing
a3Router.get(
  "/:id/mp",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const subscription = await db.subscription.findUnique({
        where: { id: req.params.id },
      });

      if (!subscription || subscription.method !== "a3_plan" || subscription.deletedAt !== null) {
        res.status(404).json({ error: "Subscription not found" });
        return;
      }

      if (!subscription.mpId) {
        res
          .status(422)
          .json({ error: "Subscription has no mpId to search (redirect-path subscriptions have no mpId until the payer completes checkout)" });
        return;
      }

      let mpResult: unknown;
      try {
        mpResult = await getA3Subscription(mpClient(), subscription.mpId);
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

// GET /a3/:id — detail view: subscription + unified timeline
// /plans/* and /:id/mp are registered above and are not shadowed by this single-segment route
a3Router.get(
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

      if (!subscription || subscription.method !== "a3_plan" || subscription.deletedAt !== null) {
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
        preapprovalPlanId: subscription.preapprovalPlanId,
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

// GET /a3/ — list all a3_plan subscriptions with their webhook events
a3Router.get("/", async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const subscriptions = await db.subscription.findMany({
      where: { method: "a3_plan", deletedAt: null },
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
      preapprovalPlanId: s.preapprovalPlanId,
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
