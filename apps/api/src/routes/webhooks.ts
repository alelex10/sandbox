import { Router, Request, Response, NextFunction } from "express";
import { Prisma } from "@prisma/client";
import { db } from "../db.js";
import { mpFetch } from "../mp.js";
import { classifyWebhook } from "payments";
import { tryJsonParse } from "../util.js";
import { paginate, parsePagination } from "../lib/pagination.js";

export const webhooksRouter = Router();

// GET /webhooks/health — stable JSON marker used by the tunnel self-check
// (diag/tunnel-check fetches this URL from the public tunnel to verify
// the tunnel is reachable and forwarding to our process, not an auth wall)
webhooksRouter.get("/health", (_req: Request, res: Response) => {
  res.json({ ok: true, service: "mp-webhooks" });
});

// POST /webhooks/mp — ingest all MercadoPago webhook topics
export async function mpWebhookHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const rawBody = JSON.stringify(req.body);
    const topic: string = req.body?.topic ?? req.body?.type ?? "unknown";
    const action: string | undefined = req.body?.action;
    const mpResourceId: string | undefined =
      req.body?.data?.id ?? req.body?.id;

    const { category, method } = classifyWebhook(topic);

    const event = await db.webhookEvent.create({
      data: {
        topic,
        category,
        method: method ?? null,
        action: action ?? null,
        mpResourceId: mpResourceId ?? null,
        rawBody,
      },
    });

    // Respond 200 immediately — do not await enrichment
    res.status(200).json({ received: true });

    // Best-effort async enrichment — errors are logged, never thrown
    setImmediate(async () => {
      try {
        let resolvedMethod = method;
        let subscriptionId: string | null = null;

        // Attempt to fetch the MP resource for enrichment
        let rawFetched: string | null = null;
        if (mpResourceId) {
          try {
            const resourcePath = topicToResourcePath(topic, mpResourceId);
            if (resourcePath) {
              const fetched = await mpFetch(resourcePath);
              rawFetched = JSON.stringify(fetched);

              // Attempt attribution via externalReference on the fetched resource
              const fetchedObj = fetched as Record<string, unknown>;
              const extRef =
                fetchedObj?.external_reference as string | undefined;

              if (extRef) {
                const matched = await db.subscription.findFirst({
                  where: { externalReference: extRef },
                  select: { id: true, method: true },
                });
                if (matched) {
                  subscriptionId = matched.id;
                  if (!resolvedMethod) {
                    resolvedMethod = matched.method;
                  }
                }
              }
            }
          } catch (fetchErr) {
            console.error("[webhook] enrichment fetch failed:", fetchErr);
          }
        }

        await db.webhookEvent.update({
          where: { id: event.id },
          data: {
            rawFetched,
            subscriptionId,
            method: resolvedMethod ?? method ?? null,
          },
        });
      } catch (enrichErr) {
        console.error("[webhook] enrichment update failed:", enrichErr);
      }
    });
  } catch (err) {
    next(err);
  }
}

webhooksRouter.post("/mp", mpWebhookHandler);

// DELETE /webhooks/:id — soft-delete a single webhook event
webhooksRouter.delete("/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const existing = await db.webhookEvent.findUnique({ where: { id: req.params.id } });
    if (!existing || existing.deletedAt !== null) {
      res.status(404).json({ error: "Webhook event not found" });
      return;
    }
    await db.webhookEvent.update({
      where: { id: req.params.id },
      data: { deletedAt: new Date() },
    });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// DELETE /webhooks — soft-delete all webhook events
webhooksRouter.delete("/", async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await db.webhookEvent.updateMany({
      where: { deletedAt: null },
      data: { deletedAt: new Date() },
    });
    res.json({ ok: true, count: result.count });
  } catch (err) {
    next(err);
  }
});

// GET /webhooks?method=&subscriptionId=&planId=&page=&limit= — list events.
// - method: filter by method. Special value "unattributed" returns events
//   where method IS NULL or "unknown" (these can never be linked to a
//   subscription/plan, so the other filters are ignored in that case).
// - subscriptionId: only events attributed to this local subscription id.
// - planId: local Plan.id; only events attributed to any subscription linked
//   to this plan. Subscriptions link to a plan via Subscription.preapprovalPlanId
//   (which stores Plan.mpPlanId) — there is no direct FK — so we resolve the
//   local id to its mpPlanId, then scope through WebhookEvent.subscription.
// - page/limit: paginated; default limit = 200, cap = 200 (preserves the
//   pre-pagination hardcoded `take: 200` upper bound).
webhooksRouter.get("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const method = req.query.method as string | undefined;
    const subscriptionId = req.query.subscriptionId as string | undefined;
    const planId = req.query.planId as string | undefined;

    let where: Prisma.WebhookEventWhereInput;
    if (method === "unattributed") {
      where = { OR: [{ method: null }, { method: "unknown" }], deletedAt: null };
    } else {
      where = { deletedAt: null };
      if (method) where.method = method;
      if (subscriptionId) {
        where.subscriptionId = subscriptionId;
      } else if (planId) {
        const plan = await db.plan.findUnique({
          where: { id: planId },
          select: { mpPlanId: true },
        });
        // No mpPlanId => the plan has no subscriptions => empty feed.
        where.subscription = {
          is: { preapprovalPlanId: plan?.mpPlanId ?? "__no_plan__" },
        };
      }
    }

    const { page, limit } = parsePagination(req.query, {
      maxLimit: 200,
      defaultLimit: 200,
    });
    const envelope = await paginate(
      db.webhookEvent,
      {
        where,
        orderBy: { receivedAt: "desc" },
      },
      { page, limit },
    );

    // Parse-on-read: rawBody and rawFetched are stored as JSON strings.
    // Return parsed objects so callers don't have to double-decode.
    res.json({
      ...envelope,
      items: envelope.items.map((ev) => ({
        ...ev,
        rawBody: tryJsonParse(ev.rawBody as string | null),
        rawFetched: tryJsonParse(ev.rawFetched as string | null),
      })),
    });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function topicToResourcePath(
  topic: string,
  resourceId: string,
): string | null {
  switch (topic) {
    case "subscription_preapproval":
      return `/preapproval/${resourceId}`;
    case "subscription_authorized_payment":
      // Confirmed: /authorized_payments/{id} is the correct enrichment path.
      // Source: mercadopago SDK v3 dist/clients/invoice/get/index.js line ~25.
      return `/authorized_payments/${resourceId}`;
    case "subscription_preapproval_plan":
      return `/preapproval_plan/${resourceId}`;
    case "payment":
    case "payments":
      return `/v1/payments/${resourceId}`;
    case "orders":
      return `/v1/orders/${resourceId}`;
    default:
      return null;
  }
}
