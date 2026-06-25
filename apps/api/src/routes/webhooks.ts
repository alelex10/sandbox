import { Router, Request, Response, NextFunction } from "express";
import { db } from "../db.js";
import { mpFetch } from "../mp.js";
import { classifyWebhook } from "payments";

export const webhooksRouter = Router();

// POST /webhooks/mp — ingest all MercadoPago webhook topics
webhooksRouter.post(
  "/mp",
  async (req: Request, res: Response, next: NextFunction) => {
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
  },
);

// GET /webhooks?method= — list events, optionally filtered by method.
// Special value "unattributed" returns events where method IS NULL or "unknown".
webhooksRouter.get("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const method = req.query.method as string | undefined;

    const events = await db.webhookEvent.findMany({
      where:
        method === "unattributed"
          ? { OR: [{ method: null }, { method: "unknown" }] }
          : method
            ? { method }
            : undefined,
      orderBy: { receivedAt: "desc" },
      take: 200,
    });

    // Parse-on-read: rawBody and rawFetched are stored as JSON strings.
    // Return parsed objects so callers don't have to double-decode.
    const parsed = events.map((ev) => ({
      ...ev,
      rawBody: tryJsonParse(ev.rawBody as string | null),
      rawFetched: tryJsonParse(ev.rawFetched as string | null),
    }));

    res.json(parsed);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Null-safe JSON.parse. Returns the parsed value, or the raw string if parse
 * fails, or null if the input is null/undefined. */
function tryJsonParse(value: string | null | undefined): unknown {
  if (value == null) return null;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

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
