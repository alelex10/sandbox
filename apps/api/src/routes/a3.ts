import { Router, Request, Response, NextFunction } from "express";
import { CreatePlanRequest, SubscribeToPlanRequest } from "shared";
import { createPlan, subscribeToPlan, getA3Subscription } from "payments";
import { db } from "../db.js";
import { mpClient, getMpBackUrl } from "../mp.js";
import { tryJsonParse } from "../util.js";

export const a3Router = Router();

// POST /a3/plans — create a PreApprovalPlan template
a3Router.post("/plans", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = CreatePlanRequest.parse(req.body);

    const result = await createPlan(mpClient(), {
      reason: body.reason,
      backUrl: getMpBackUrl(),
      autoRecurring: {
        frequency: body.autoRecurring.frequency,
        frequencyType: body.autoRecurring.frequencyType,
        amount: body.autoRecurring.amount,
        currency: body.autoRecurring.currency,
        ...(body.billingDay !== undefined
          ? { billingDay: body.billingDay }
          : {}),
      },
    });

    // Fix #1: guard against missing mpPlanId — do not persist a null plan id
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

    // Fix #4: prefer billing fields from MP auto_recurring; fall back to request body
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

    const plan = await db.plan.create({
      data: {
        mpPlanId,
        reason: body.reason,
        amount,
        currency,
        frequency,
        frequencyType,
        initPoint: (result as { init_point?: string }).init_point ?? null,
        rawCreate: JSON.stringify(result),
      },
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
      createdAt: plan.createdAt.toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

// GET /a3/plans — list all Plan rows (parse-on-read for rawCreate)
a3Router.get("/plans", async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const plans = await db.plan.findMany({
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
      createdAt: p.createdAt.toISOString(),
    }));

    res.json(result);
  } catch (err) {
    next(err);
  }
});

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
        backUrl: getMpBackUrl(),
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

      // Fix #3: guard — do not persist Subscription when plan is missing or has no initPoint
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

      // Fix #7: 201 for redirect-path creation (consistent with API path)
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

// GET /a3 — list all a3_plan subscriptions with their webhook events
a3Router.get("/", async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const subscriptions = await db.subscription.findMany({
      where: { method: "a3_plan" },
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

// GET /a3/:id/mp — fetch live MP state for a subscription, update rawLastSearch, return result
a3Router.get(
  "/:id/mp",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const subscription = await db.subscription.findUnique({
        where: { id: req.params.id },
      });

      if (!subscription || subscription.method !== "a3_plan") {
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

      await db.subscription.update({
        where: { id: subscription.id },
        // M2: also sync Subscription.status so sidebar badge reflects latest known state
        data: {
          rawLastSearch: rawSearch,
          status: mpStatus != null ? String(mpStatus) : undefined,
        },
      });

      await db.subscriptionSnapshot.create({
        data: {
          subscriptionId: subscription.id,
          kind: "search",
          statusAtTime: mpStatus != null ? String(mpStatus) : null,
          raw: rawSearch,
        },
      });

      res.json(mpResult);
    } catch (err) {
      next(err);
    }
  },
);

// GET /a3/:id — detail view: subscription + unified timeline
// /:id/mp and /plans are separate path shapes and are not shadowed by this single-segment route
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

      if (!subscription || subscription.method !== "a3_plan") {
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
