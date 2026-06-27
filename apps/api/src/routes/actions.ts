import { Router, Request, Response, NextFunction } from "express";
import { db } from "../db.js";
import { mpFetch } from "../mp.js";

export const actionsRouter = Router();

// POST /actions/subscriptions/:id/cancel
// Cancel a preapproval subscription in MercadoPago and update local state.
actionsRouter.post(
  "/subscriptions/:id/cancel",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const subscription = await db.subscription.findUnique({
        where: { id: req.params.id },
      });

      if (!subscription || subscription.deletedAt !== null) {
        res.status(404).json({ error: "Subscription not found" });
        return;
      }

      if (subscription.method === "b_orders" || !subscription.mpId) {
        res
          .status(400)
          .json({
            error:
              "Cancelación no aplica (no es preapproval o falta mpId)",
          });
        return;
      }

      let mpResult: unknown;
      try {
        mpResult = await mpFetch(
          `/preapproval/${subscription.mpId}`,
          {
            method: "PUT",
            body: JSON.stringify({ status: "cancelled" }),
          },
        );
      } catch (mpErr) {
        const detail =
          mpErr instanceof Error ? mpErr.message : "Unknown MP error";
        res.status(502).json({ error: "MercadoPago request failed", detail });
        return;
      }

      const mpStatus =
        (mpResult as Record<string, unknown>)?.status ?? "cancelled";
      const rawSearch = JSON.stringify(mpResult);

      const updated = await db.$transaction(async (tx) => {
        const sub = await tx.subscription.update({
          where: { id: subscription.id },
          data: {
            status: String(mpStatus),
            rawLastSearch: rawSearch,
          },
        });
        await tx.subscriptionSnapshot.create({
          data: {
            subscriptionId: subscription.id,
            kind: "search",
            statusAtTime: String(mpStatus),
            raw: rawSearch,
          },
        });
        return sub;
      });

      res.json({ ok: true, status: updated.status, id: updated.id });
    } catch (err) {
      next(err);
    }
  },
);

// POST /actions/payments/:paymentId/refund
// Issue a full refund for an approved payment in MercadoPago.
actionsRouter.post(
  "/payments/:paymentId/refund",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { paymentId } = req.params;

      let refundResult: unknown;
      try {
        refundResult = await mpFetch(
          `/v1/payments/${paymentId}/refunds`,
          {
            method: "POST",
            headers: {
              "X-Idempotency-Key": crypto.randomUUID(),
            },
          },
        );
      } catch (mpErr) {
        const detail =
          mpErr instanceof Error ? mpErr.message : "Unknown MP error";
        res.status(502).json({ error: "MercadoPago refund failed", detail });
        return;
      }

      res.json(refundResult);
    } catch (err) {
      next(err);
    }
  },
);
