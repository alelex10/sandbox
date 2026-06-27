import { Router, Request, Response, NextFunction } from "express";
import { db } from "../db.js";
import { mpFetch } from "../mp.js";
import { env } from "../config.js";

export const diagRouter = Router();

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MpPayment {
  id?: unknown;
  status?: unknown;
  status_detail?: unknown;
  transaction_amount?: unknown;
  currency_id?: unknown;
  payment_method_id?: unknown;
  date_created?: unknown;
  external_reference?: unknown;
  payer?: { email?: unknown } | null;
}

interface MpPaymentSearchResponse {
  results?: MpPayment[];
  [key: string]: unknown;
}

interface MpAuthorizedPayment {
  id?: unknown;
  status?: unknown;
  status_detail?: unknown;
  transaction_amount?: unknown;
  currency_id?: unknown;
  payment_method_id?: unknown;
  date_created?: unknown;
  external_reference?: unknown;
  preapproval_id?: unknown;
  payment?: MpPayment | null;
  [key: string]: unknown;
}

interface MpAuthorizedPaymentSearchResponse {
  results?: MpAuthorizedPayment[];
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Normalizer
// ---------------------------------------------------------------------------

function normPayment(p: MpPayment) {
  return {
    id: String(p.id ?? ""),
    status: typeof p.status === "string" ? p.status : null,
    statusDetail: typeof p.status_detail === "string" ? p.status_detail : null,
    amount: typeof p.transaction_amount === "number" ? p.transaction_amount : null,
    currency: typeof p.currency_id === "string" ? p.currency_id : null,
    paymentMethodId:
      typeof p.payment_method_id === "string" ? p.payment_method_id : null,
    dateCreated: typeof p.date_created === "string" ? p.date_created : null,
    externalReference:
      typeof p.external_reference === "string" ? p.external_reference : null,
    payerEmail:
      p.payer && typeof p.payer.email === "string" ? p.payer.email : null,
    raw: p,
  };
}

function normAuthorizedPayment(ap: MpAuthorizedPayment) {
  // Authorized-payment objects sometimes nest the underlying payment in ap.payment
  const nested = ap.payment ?? null;
  return {
    id: String(ap.id ?? ""),
    status:
      typeof ap.status === "string"
        ? ap.status
        : nested && typeof (nested as MpPayment).status === "string"
          ? String((nested as MpPayment).status)
          : null,
    statusDetail:
      typeof ap.status_detail === "string"
        ? ap.status_detail
        : nested && typeof (nested as MpPayment).status_detail === "string"
          ? String((nested as MpPayment).status_detail)
          : null,
    amount:
      typeof ap.transaction_amount === "number"
        ? ap.transaction_amount
        : nested && typeof (nested as MpPayment).transaction_amount === "number"
          ? ((nested as MpPayment).transaction_amount as number)
          : null,
    currency:
      typeof ap.currency_id === "string"
        ? ap.currency_id
        : nested && typeof (nested as MpPayment).currency_id === "string"
          ? String((nested as MpPayment).currency_id)
          : null,
    paymentMethodId:
      typeof ap.payment_method_id === "string"
        ? ap.payment_method_id
        : nested && typeof (nested as MpPayment).payment_method_id === "string"
          ? String((nested as MpPayment).payment_method_id)
          : null,
    dateCreated:
      typeof ap.date_created === "string"
        ? ap.date_created
        : nested && typeof (nested as MpPayment).date_created === "string"
          ? String((nested as MpPayment).date_created)
          : null,
    externalReference:
      typeof ap.external_reference === "string"
        ? ap.external_reference
        : nested && typeof (nested as MpPayment).external_reference === "string"
          ? String((nested as MpPayment).external_reference)
          : null,
    payerEmail: null as string | null,
    raw: ap,
  };
}

// ---------------------------------------------------------------------------
// GET /diag/payments?limit=10
// Returns recent payments from MP (payment search, sorted desc by date_created)
// ---------------------------------------------------------------------------

diagRouter.get(
  "/payments",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const limit = Math.min(
        50,
        Math.max(1, parseInt(String(req.query.limit ?? "10"), 10) || 10),
      );

      let mpResult: MpPaymentSearchResponse;
      try {
        mpResult = (await mpFetch(
          `/v1/payments/search?sort=date_created&criteria=desc&limit=${limit}`,
        )) as MpPaymentSearchResponse;
      } catch (mpErr) {
        const detail =
          mpErr instanceof Error ? mpErr.message : "Unknown MP error";
        res.status(502).json({ error: "MercadoPago fetch failed", detail });
        return;
      }

      const payments = (mpResult.results ?? []).map(normPayment);
      res.json({ payments });
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// GET /diag/subscriptions/:id/payments
// Returns payments tied to a local subscription, merged from multiple MP queries
// ---------------------------------------------------------------------------

diagRouter.get(
  "/subscriptions/:id/payments",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;

      const sub = await db.subscription.findFirst({
        where: { id, deletedAt: null },
      });
      if (!sub) {
        res.status(404).json({ error: "Subscription not found" });
        return;
      }

      const sources: string[] = [];
      const errors: string[] = [];
      const paymentsById = new Map<
        string,
        ReturnType<typeof normPayment>
      >();

      // ── Source 1: /v1/payments/search?external_reference={ref} ──
      if (sub.externalReference) {
        const source1 = `GET /v1/payments/search?external_reference=${sub.externalReference}`;
        sources.push(source1);
        try {
          const r = (await mpFetch(
            `/v1/payments/search?external_reference=${encodeURIComponent(sub.externalReference)}&sort=date_created&criteria=desc&limit=50`,
          )) as MpPaymentSearchResponse;
          for (const p of r.results ?? []) {
            const n = normPayment(p);
            paymentsById.set(n.id, n);
          }
        } catch (err) {
          errors.push(
            `${source1}: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }

      // ── Source 2: /authorized_payments/search?preapproval_id={mpId} ──
      // Only for preapproval methods (a1/a2/a3) that have an mpId.
      // This endpoint is not officially documented but is confirmed working
      // in the MP sandbox for recurring preapproval charges.
      const isPreapprovalMethod =
        sub.method === "a1_pending" ||
        sub.method === "a2_authorized" ||
        sub.method === "a3_plan";

      if (isPreapprovalMethod && sub.mpId) {
        const source2 = `GET /authorized_payments/search?preapproval_id=${sub.mpId}`;
        sources.push(source2);
        try {
          // NOTE: /authorized_payments/search rejects an explicit `limit`
          // ("Invalid value for limit"). Omit it and let MP use its default.
          const r = (await mpFetch(
            `/authorized_payments/search?preapproval_id=${encodeURIComponent(sub.mpId)}`,
          )) as MpAuthorizedPaymentSearchResponse;
          for (const ap of r.results ?? []) {
            const n = normAuthorizedPayment(ap);
            if (!paymentsById.has(n.id)) {
              paymentsById.set(n.id, n);
            }
          }
        } catch (err) {
          // Non-fatal: this endpoint may not exist or may 404 in test mode
          errors.push(
            `${source2}: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }

      // All sources failed and there are no results → 502
      if (paymentsById.size === 0 && errors.length > 0 && sources.length === errors.length) {
        // Only 502 if every source errored; if some returned 0 results that's fine
        const allFailed = sources.every((_s, i) =>
          errors.some((e) => e.startsWith(sources[i])),
        );
        if (allFailed && sources.length > 0) {
          res.status(502).json({
            error: "All MP queries failed",
            errors,
            sources,
          });
          return;
        }
      }

      // Sort merged results by dateCreated desc (nulls last)
      const payments = Array.from(paymentsById.values()).sort((a, b) => {
        if (!a.dateCreated && !b.dateCreated) return 0;
        if (!a.dateCreated) return 1;
        if (!b.dateCreated) return -1;
        return b.dateCreated.localeCompare(a.dateCreated);
      });

      res.json({
        payments,
        sources,
        ...(errors.length > 0 ? { errors } : {}),
      });
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// GET /diag/tunnel-check
// Server-side self-check: fetches the public tunnel URL and verifies it
// returns our own /webhooks/health marker. Detects auth-wall responses
// (VSCode private dev tunnels redirect to a GitHub login page).
// ---------------------------------------------------------------------------

diagRouter.get(
  "/tunnel-check",
  async (_req: Request, res: Response) => {
    const configuredUrl = env.MP_NOTIFICATION_URL ?? null;

    if (!configuredUrl) {
      res.json({
        configured: false,
        verdict: "MP_NOTIFICATION_URL no está seteado en el .env",
      });
      return;
    }

    let checkedUrl: string;
    try {
      checkedUrl = new URL(configuredUrl).origin + "/webhooks/health";
    } catch {
      res.json({
        configured: true,
        configuredUrl,
        reachable: false,
        verdict: "MP_NOTIFICATION_URL no es una URL válida.",
        detail: "Could not parse origin from MP_NOTIFICATION_URL",
      });
      return;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8_000);

    let reachable = false;
    let status: number | null = null;
    let contentType: string | null = null;
    let bodyPreview: string | null = null;
    let isOurJson = false;
    let looksLikeAuthWall = false;

    try {
      const response = await fetch(checkedUrl, { signal: controller.signal });
      clearTimeout(timeoutId);

      reachable = true;
      status = response.status;
      contentType = response.headers.get("content-type");

      const rawBody = await response.text();
      bodyPreview = rawBody.slice(0, 500);

      // Check for our own JSON marker
      if (status === 200 && contentType?.includes("application/json")) {
        try {
          const parsed = JSON.parse(rawBody) as unknown;
          if (
            parsed !== null &&
            typeof parsed === "object" &&
            (parsed as Record<string, unknown>).ok === true &&
            (parsed as Record<string, unknown>).service === "mp-webhooks"
          ) {
            isOurJson = true;
          }
        } catch {
          // body is not valid JSON
        }
      }

      // Heuristic: detect VSCode private-tunnel auth wall
      // The auth wall is served as text/html and contains phrases like
      // "sign in", "GitHub", "authorize", "login", or "tunnel" + "access".
      if (!isOurJson) {
        const lowerBody = rawBody.toLowerCase();
        const htmlContent = contentType?.includes("text/html") ?? false;
        const authPhrases = ["sign in", "github", "authorize", "login"];
        const tunnelAccess =
          lowerBody.includes("tunnel") && lowerBody.includes("access");
        const hasAuthPhrase = authPhrases.some((phrase) =>
          lowerBody.includes(phrase),
        );
        looksLikeAuthWall = htmlContent || hasAuthPhrase || tunnelAccess;
      }
    } catch (fetchErr) {
      clearTimeout(timeoutId);
      reachable = false;

      const detail =
        fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
      res.json({
        configured: true,
        configuredUrl,
        checkedUrl,
        reachable: false,
        status: null,
        isOurJson: false,
        looksLikeAuthWall: false,
        bodyPreview: null,
        verdict:
          "❌ No se pudo alcanzar la URL (timeout/DNS/conexión). Revisá que el túnel esté levantado y la URL sea correcta.",
        detail,
      });
      return;
    }

    // Derive verdict
    let verdict: string;
    if (isOurJson) {
      verdict =
        "✅ El túnel es público y alcanzable — MP podría entregar webhooks.";
    } else if (reachable && looksLikeAuthWall) {
      verdict =
        "❌ El túnel responde pero NO es público (parece pantalla de login). Poné el puerto en visibilidad Public.";
    } else if (reachable && !isOurJson) {
      verdict =
        "⚠️ Respondió algo inesperado (no es nuestro endpoint). Revisá que la URL apunte a la API (puerto 3000) y a /webhooks.";
    } else {
      verdict =
        "❌ No se pudo alcanzar la URL (timeout/DNS/conexión). Revisá que el túnel esté levantado y la URL sea correcta.";
    }

    res.json({
      configured: true,
      configuredUrl,
      checkedUrl,
      reachable,
      status,
      isOurJson,
      looksLikeAuthWall,
      bodyPreview,
      verdict,
    });
  },
);
