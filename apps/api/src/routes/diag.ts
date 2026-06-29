import { Router, Request, Response, NextFunction } from "express";
import { db } from "../db.js";
import { mpFetch } from "../mp.js";
import { env } from "../config.js";
import { parsePagination, paginationEnvelope } from "../lib/pagination.js";

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
  paging?: { total?: number; offset?: number; limit?: number };
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
// GET /diag/payments?page=1&limit=10
// Returns recent payments from MP (payment search, sorted desc by date_created)
// as a `PaginationEnvelope<PaymentDiagResponse>` (matches the contract used by
// every other list endpoint in the app).
// ---------------------------------------------------------------------------

diagRouter.get(
  "/payments",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { page, limit, offset } = parsePagination(req.query, {
        maxLimit: 50,
        defaultLimit: 10,
      });

      let mpResult: MpPaymentSearchResponse;
      try {
        mpResult = (await mpFetch(
          `/v1/payments/search?sort=date_created&criteria=desc&limit=${limit}&offset=${offset}`,
        )) as MpPaymentSearchResponse;
      } catch (mpErr) {
        const detail =
          mpErr instanceof Error ? mpErr.message : "Unknown MP error";
        res.status(502).json({ error: "MercadoPago fetch failed", detail });
        return;
      }

      const items = (mpResult.results ?? []).map(normPayment);
      // MP's `/payments/search` includes `paging.total`. If absent, fall back
      // to items.length + offset so the envelope stays well-formed.
      const total =
        typeof mpResult.paging?.total === "number"
          ? mpResult.paging.total
          : items.length + offset;
      res.json(paginationEnvelope(items, total, page, limit));
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// GET /diag/subscriptions/:id/payments?page=1&limit=20
// Returns payments tied to a local subscription, merged from multiple MP queries
// (PR5 follow-up: envelope-shaped; per-subscription pagination is server-side
// via in-memory slice since MP's `/authorized_payments/search` rejects `?limit`).
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

      const { page, limit, offset } = parsePagination(req.query, {
        maxLimit: 100,
        defaultLimit: 20,
      });

      const paymentsById = new Map<
        string,
        ReturnType<typeof normPayment>
      >();
      // Track whether we attempted each source and whether it errored, so we
      // can still surface the "all sources failed" case (as a 502) even though
      // we no longer return the `sources` / `errors` lists in the envelope.
      let source1Attempted = false;
      let source1Failed = false;
      let source2Attempted = false;
      let source2Failed = false;

      // ── Source 1: /v1/payments/search?external_reference={ref} ──
      if (sub.externalReference) {
        source1Attempted = true;
        try {
          const r = (await mpFetch(
            `/v1/payments/search?external_reference=${encodeURIComponent(sub.externalReference)}&sort=date_created&criteria=desc&limit=50`,
          )) as MpPaymentSearchResponse;
          for (const p of r.results ?? []) {
            const n = normPayment(p);
            paymentsById.set(n.id, n);
          }
        } catch {
          source1Failed = true;
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
        source2Attempted = true;
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
        } catch {
          // Non-fatal: this endpoint may not exist or may 404 in test mode
          source2Failed = true;
        }
      }

      // All attempted sources failed and there are no results → 502.
      // Keeps the dev-facing "MP is down" signal without leaking per-source
      // error details to the client.
      const totalAttempted =
        (source1Attempted ? 1 : 0) + (source2Attempted ? 1 : 0);
      const totalFailed =
        (source1Failed ? 1 : 0) + (source2Failed ? 1 : 0);
      if (
        paymentsById.size === 0 &&
        totalAttempted > 0 &&
        totalFailed === totalAttempted
      ) {
        res.status(502).json({ error: "All MP queries failed" });
        return;
      }

      // Sort merged results by dateCreated desc (nulls last)
      const allPayments = Array.from(paymentsById.values()).sort((a, b) => {
        if (!a.dateCreated && !b.dateCreated) return 0;
        if (!a.dateCreated) return 1;
        if (!b.dateCreated) return -1;
        return b.dateCreated.localeCompare(a.dateCreated);
      });

      // Server-side slice of the in-memory merged array. Slicing is O(offset+limit)
      // and bounded by the merged set size, which is fine for the sandbox.
      const items = allPayments.slice(offset, offset + limit);
      res.json(paginationEnvelope(items, allPayments.length, page, limit));
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
