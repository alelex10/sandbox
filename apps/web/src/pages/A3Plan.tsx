import { useState, useEffect, useCallback } from "react";
import { ResponsePanel } from "../components/ResponsePanel.js";
import { WebhookList } from "../components/WebhookList.js";
import { CardFormMpJs } from "../components/CardFormMpJs.js";
import { CardBrick } from "../components/CardBrick.js";
import { ConfigErrorDisplay } from "../components/ConfigError.js";
import {
  createPlan,
  listA3Plans,
  subscribeToPlan,
  listA3,
  searchA3,
  ConfigError,
} from "../api.js";
import type {
  PlanResponse,
  SubscribeResult,
} from "../api.js";
import type { SubscriptionResponse, Tokenization } from "shared";

const PUBLIC_KEY = import.meta.env.VITE_MP_PUBLIC_KEY as string;

type TokenizationMode = "mercadopagojs" | "brick";
type SubscribePath = "redirect" | "api";

// ---------------------------------------------------------------------------
// Plan creation form state
// ---------------------------------------------------------------------------

interface PlanFormState {
  reason: string;
  frequency: string;
  frequencyType: "months" | "days";
  amount: string;
  currency: string;
  billingDay: string;
}

// ---------------------------------------------------------------------------
// Section 1 — Create Plan
// ---------------------------------------------------------------------------

function CreatePlanSection({
  onPlanCreated,
}: {
  onPlanCreated: (plan: PlanResponse) => void;
}) {
  const [form, setForm] = useState<PlanFormState>({
    reason: "",
    frequency: "1",
    frequencyType: "months",
    amount: "",
    currency: "ARS",
    billingDay: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [result, setResult] = useState<PlanResponse | null>(null);

  function handleChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const payload: Parameters<typeof createPlan>[0] = {
        reason: form.reason,
        autoRecurring: {
          frequency: Number(form.frequency),
          frequencyType: form.frequencyType,
          amount: Number(form.amount),
          currency: form.currency,
        },
      };
      if (form.billingDay) {
        payload.billingDay = Number(form.billingDay);
      }
      const created = await createPlan(payload);
      setResult(created);
      onPlanCreated(created);
    } catch (err) {
      setError(err instanceof Error ? err : new Error("Request failed"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="mb-10">
      <h3 className="text-base font-semibold text-gray-900 mb-1">
        Sección 1 — Crear plan
      </h3>
      <p className="text-sm text-gray-500 mb-4">
        Creates a{" "}
        <code className="text-xs bg-gray-100 px-1 rounded">
          PreApprovalPlan
        </code>{" "}
        template. The returned{" "}
        <code className="text-xs bg-gray-100 px-1 rounded">init_point</code> is
        the public checkout link payers can use to subscribe.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Reason
          </label>
          <input
            type="text"
            name="reason"
            value={form.reason}
            onChange={handleChange}
            required
            placeholder="Monthly premium plan"
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <fieldset className="border border-gray-200 rounded p-4 space-y-4">
          <legend className="text-sm font-medium text-gray-700 px-1">
            Auto-recurring billing
          </legend>

          <div className="flex gap-4">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Frequency
              </label>
              <input
                type="number"
                name="frequency"
                value={form.frequency}
                onChange={handleChange}
                min="1"
                required
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Frequency type
              </label>
              <select
                name="frequencyType"
                value={form.frequencyType}
                onChange={handleChange}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="months">months</option>
                <option value="days">days</option>
              </select>
            </div>
          </div>

          <div className="flex gap-4">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Amount
              </label>
              <input
                type="number"
                name="amount"
                value={form.amount}
                onChange={handleChange}
                min="0.01"
                step="0.01"
                required
                placeholder="1000"
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="w-28">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Currency
              </label>
              <input
                type="text"
                name="currency"
                value={form.currency}
                onChange={handleChange}
                maxLength={3}
                minLength={3}
                pattern="[A-Za-z]{3}"
                required
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Billing day{" "}
              <span className="text-gray-400 font-normal">
                (optional, 1–28)
              </span>
            </label>
            <input
              type="number"
              name="billingDay"
              value={form.billingDay}
              onChange={handleChange}
              min="1"
              max="28"
              placeholder="Leave empty for default"
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </fieldset>

        {error && (
          <>
            {error instanceof ConfigError ? (
              <ConfigErrorDisplay error={error} />
            ) : (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
                {error.message}
              </p>
            )}
          </>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full bg-blue-600 text-white rounded px-4 py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {submitting ? "Creating…" : "Create plan"}
        </button>
      </form>

      {result && (
        <div className="mt-4 space-y-3">
          {result.initPoint && (
            <div className="bg-blue-50 border border-blue-200 rounded px-4 py-3">
              <p className="text-xs font-semibold text-blue-700 mb-1 uppercase tracking-wide">
                Plan init_point (public checkout link)
              </p>
              <a
                href={result.initPoint}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-blue-600 underline break-all hover:text-blue-800"
              >
                {result.initPoint}
              </a>
            </div>
          )}
          <ResponsePanel data={result} />
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Plan picker — lists existing plans for the subscribe section
// ---------------------------------------------------------------------------

function PlanPicker({
  plans,
  selectedId,
  onSelect,
}: {
  plans: PlanResponse[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  // Fix #2: only plans with a real mpPlanId are selectable
  const selectablePlans = plans.filter((p) => p.mpPlanId);

  if (plans.length === 0) {
    return (
      <p className="text-sm text-gray-500 italic">
        No plans created yet — use Section 1 to create one first.
      </p>
    );
  }

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        Select plan
      </label>
      <select
        value={selectedId}
        onChange={(e) => onSelect(e.target.value)}
        className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        <option value="">— choose a plan —</option>
        {selectablePlans.map((p) => (
          // Fix #2: value is always mpPlanId — never falls back to local id
          <option key={p.id} value={p.mpPlanId!}>
            {p.reason ?? "Unnamed plan"} — {p.amount} {p.currency} /{" "}
            {p.frequency} {p.frequencyType}{" "}
            ({p.mpPlanId})
          </option>
        ))}
        {plans.filter((p) => !p.mpPlanId).map((p) => (
          // Plans without mpPlanId are rendered disabled and non-selectable
          <option key={p.id} value="" disabled>
            {p.reason ?? "Unnamed plan"} (no mpPlanId — not selectable)
          </option>
        ))}
      </select>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section 2 — Subscribe payer
// ---------------------------------------------------------------------------

function SubscribeSection({
  plans,
  onSubscribed,
}: {
  plans: PlanResponse[];
  onSubscribed: () => void;
}) {
  const [selectedPlanMpId, setSelectedPlanMpId] = useState("");
  const [payerEmail, setPayerEmail] = useState("");
  const [externalReference, setExternalReference] = useState("");
  const [subscribePath, setSubscribePath] = useState<SubscribePath>("redirect");
  const [tokenizationMode, setTokenizationMode] =
    useState<TokenizationMode>("mercadopagojs");
  const [cardTokenId, setCardTokenId] = useState<string | null>(null);
  const [tokenSource, setTokenSource] = useState<Tokenization | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [result, setResult] = useState<SubscribeResult | null>(null);

  // Fix #2: look up selected plan by mpPlanId only — never by local id
  const selectedPlan = plans.find((p) => p.mpPlanId === selectedPlanMpId);

  function handleToken(tokenId: string) {
    setCardTokenId(tokenId);
    setTokenSource(tokenizationMode);
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!selectedPlanMpId) {
      setError(new Error("Select a plan first."));
      return;
    }

    if (subscribePath === "api" && !cardTokenId) {
      setError(new Error("Tokenize the card first using one of the methods above."));
      return;
    }

    setSubmitting(true);
    try {
      const payload: Parameters<typeof subscribeToPlan>[0] = {
        preapprovalPlanId: selectedPlanMpId,
        payerEmail,
        externalReference: externalReference || crypto.randomUUID(),
      };

      if (subscribePath === "api" && cardTokenId && tokenSource) {
        payload.cardTokenId = cardTokenId;
        payload.tokenization = tokenSource;
      }

      const res = await subscribeToPlan(payload);
      setResult(res);
      // Token is single-use — clear after POST
      setCardTokenId(null);
      setTokenSource(null);
      onSubscribed();
    } catch (err) {
      setError(err instanceof Error ? err : new Error("Request failed"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section>
      <h3 className="text-base font-semibold text-gray-900 mb-1">
        Sección 2 — Suscribir pagador
      </h3>
      <p className="text-sm text-gray-500 mb-4">
        Subscribe a payer to an existing plan. Choose between the redirect
        checkout path (no card token needed) or the direct API path (requires
        tokenization).
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <PlanPicker
          plans={plans}
          selectedId={selectedPlanMpId}
          onSelect={setSelectedPlanMpId}
        />

        {/* Show plan init_point as a quick "Open plan checkout" shortcut */}
        {selectedPlan?.initPoint && (
          <div className="bg-gray-50 border border-gray-200 rounded px-4 py-3 flex items-center justify-between gap-4">
            <span className="text-xs text-gray-500 truncate">
              {selectedPlan.initPoint}
            </span>
            <a
              href={selectedPlan.initPoint}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 bg-gray-800 text-white text-xs rounded px-3 py-1.5 font-medium hover:bg-gray-900 transition-colors"
            >
              Abrir checkout del plan
            </a>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Payer email
          </label>
          <input
            type="email"
            value={payerEmail}
            onChange={(e) => setPayerEmail(e.target.value)}
            required
            placeholder="payer@example.com"
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            External reference{" "}
            <span className="text-gray-400 font-normal">
              (optional — auto-generated if empty)
            </span>
          </label>
          <input
            type="text"
            value={externalReference}
            onChange={(e) => setExternalReference(e.target.value)}
            placeholder="order-456"
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Subscribe path selector */}
        <div>
          <p className="text-sm font-medium text-gray-700 mb-2">
            Subscribe path
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setSubscribePath("redirect");
                setCardTokenId(null);
                setTokenSource(null);
              }}
              className={[
                "px-4 py-2 rounded text-sm font-medium border transition-colors",
                subscribePath === "redirect"
                  ? "bg-blue-600 text-white border-blue-600"
                  : "bg-white text-gray-700 border-gray-300 hover:border-gray-400",
              ].join(" ")}
            >
              Via init_point (redirect)
            </button>
            <button
              type="button"
              onClick={() => setSubscribePath("api")}
              className={[
                "px-4 py-2 rounded text-sm font-medium border transition-colors",
                subscribePath === "api"
                  ? "bg-blue-600 text-white border-blue-600"
                  : "bg-white text-gray-700 border-gray-300 hover:border-gray-400",
              ].join(" ")}
            >
              Via API (card token)
            </button>
          </div>
        </div>

        {/* Tokenization — only shown for API path */}
        {subscribePath === "api" && (
          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">
              Tokenization method
            </p>
            <div className="flex gap-2 mb-4">
              <button
                type="button"
                onClick={() => {
                  setTokenizationMode("mercadopagojs");
                  setCardTokenId(null);
                  setTokenSource(null);
                }}
                className={[
                  "px-4 py-2 rounded text-sm font-medium border transition-colors",
                  tokenizationMode === "mercadopagojs"
                    ? "bg-blue-600 text-white border-blue-600"
                    : "bg-white text-gray-700 border-gray-300 hover:border-gray-400",
                ].join(" ")}
              >
                MP.js v2 (custom form)
              </button>
              <button
                type="button"
                onClick={() => {
                  setTokenizationMode("brick");
                  setCardTokenId(null);
                  setTokenSource(null);
                }}
                className={[
                  "px-4 py-2 rounded text-sm font-medium border transition-colors",
                  tokenizationMode === "brick"
                    ? "bg-blue-600 text-white border-blue-600"
                    : "bg-white text-gray-700 border-gray-300 hover:border-gray-400",
                ].join(" ")}
              >
                Card Payment Brick
              </button>
            </div>

            <div className="border border-gray-200 rounded p-4 bg-gray-50">
              {tokenizationMode === "mercadopagojs" ? (
                <CardFormMpJs publicKey={PUBLIC_KEY} onToken={handleToken} />
              ) : (
                <CardBrick
                  key={`brick-${tokenizationMode}`}
                  publicKey={PUBLIC_KEY}
                  onToken={handleToken}
                />
              )}
            </div>

            {cardTokenId && (
              <p className="mt-2 text-xs text-green-700 bg-green-50 border border-green-200 rounded px-3 py-2">
                Card token ready (via{" "}
                <span className="font-mono">{tokenSource}</span>). Submit to
                create the subscription.
              </p>
            )}
          </div>
        )}

        {error && (
          <>
            {error instanceof ConfigError ? (
              <ConfigErrorDisplay error={error} />
            ) : (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
                {error.message}
              </p>
            )}
          </>
        )}

        <button
          type="submit"
          disabled={submitting || (subscribePath === "api" && !cardTokenId)}
          className="w-full bg-blue-600 text-white rounded px-4 py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {submitting
            ? "Processing…"
            : subscribePath === "redirect"
              ? "Subscribe via init_point"
              : cardTokenId
                ? "Subscribe via API"
                : "Tokenize card first"}
        </button>
      </form>

      {result && (
        <div className="mt-4 space-y-3">
          {result.path === "redirect" && result.initPoint && (
            <div className="bg-blue-50 border border-blue-200 rounded px-4 py-3">
              <p className="text-xs font-semibold text-blue-700 mb-1 uppercase tracking-wide">
                Redirect payer to this link
              </p>
              <a
                href={result.initPoint}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-blue-600 underline break-all hover:text-blue-800"
              >
                {result.initPoint}
              </a>
            </div>
          )}
          <ResponsePanel data={result} />
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// A3Plan — main page component
// ---------------------------------------------------------------------------

export function A3Plan() {
  const [plans, setPlans] = useState<PlanResponse[]>([]);
  const [subscriptions, setSubscriptions] = useState<SubscriptionResponse[]>([]);
  const [searchResult, setSearchResult] = useState<unknown>(null);
  const [searching, setSearching] = useState(false);
  const [searchTargetId, setSearchTargetId] = useState("");
  const [searchError, setSearchError] = useState<string | null>(null);
  // Fix #5: distinguish info-level search feedback from errors
  const [searchIsInfo, setSearchIsInfo] = useState(false);

  const fetchPlans = useCallback(async () => {
    try {
      const rows = await listA3Plans();
      setPlans(rows);
    } catch {
      // non-critical — ignore
    }
  }, []);

  const fetchSubscriptions = useCallback(async () => {
    try {
      const rows = await listA3();
      setSubscriptions(rows);
    } catch {
      // non-critical — ignore
    }
  }, []);

  useEffect(() => {
    void fetchPlans();
    void fetchSubscriptions();
  }, [fetchPlans, fetchSubscriptions]);

  function handlePlanCreated(plan: PlanResponse) {
    setPlans((prev) => [plan, ...prev]);
  }

  async function handleSearch() {
    if (!searchTargetId) return;
    setSearchError(null);
    setSearchIsInfo(false);
    setSearchResult(null);

    // Fix #5: if the selected subscription is pending_redirect, don't call MP — show info instead
    const targetSub = subscriptions.find((s) => s.id === searchTargetId);
    if (targetSub?.status === "pending_redirect") {
      setSearchIsInfo(true);
      setSearchError(
        "Esta suscripción está esperando que el pagador complete el checkout. No hay registro en MP todavía." +
          (targetSub.initPoint ? ` Init point: ${targetSub.initPoint}` : ""),
      );
      return;
    }

    setSearching(true);
    try {
      const result = await searchA3(searchTargetId);
      setSearchResult(result);
    } catch (err) {
      setSearchIsInfo(false);
      setSearchError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setSearching(false);
    }
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h2 className="text-xl font-semibold text-gray-900 mb-1">
        A.3 — Preapproval Plan
      </h2>
      <p className="text-sm text-gray-500 mb-8">
        Two-step flow: first create a plan template (
        <code className="text-xs bg-gray-100 px-1 rounded">
          PreApprovalPlan
        </code>
        ), then subscribe a payer either via the hosted checkout link or
        directly via the API with a card token.
      </p>

      <CreatePlanSection onPlanCreated={handlePlanCreated} />

      <hr className="border-gray-200 my-8" />

      <SubscribeSection
        plans={plans}
        onSubscribed={() => {
          void fetchSubscriptions();
        }}
      />

      <hr className="border-gray-200 my-8" />

      {/* Search in MP */}
      <section className="mb-8">
        <h3 className="text-base font-semibold text-gray-900 mb-3">
          Buscar en MP
        </h3>
        <div className="flex gap-2">
          <input
            type="text"
            value={searchTargetId}
            onChange={(e) => setSearchTargetId(e.target.value)}
            placeholder="Local subscription ID (UUID)"
            className="flex-1 border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={handleSearch}
            disabled={searching || !searchTargetId}
            className="bg-gray-700 text-white rounded px-4 py-2 text-sm font-medium hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {searching ? "Searching…" : "Buscar en MP"}
          </button>
        </div>
        {searchError && (
          <p
            className={[
              "mt-2 text-sm rounded px-3 py-2 border",
              // Fix #5: info styling for pending_redirect, error styling otherwise
              searchIsInfo
                ? "text-blue-700 bg-blue-50 border-blue-200"
                : "text-red-600 bg-red-50 border-red-200",
            ].join(" ")}
          >
            {searchError}
          </p>
        )}
        {searchResult !== null && (
          <div className="mt-3">
            <ResponsePanel data={searchResult} />
          </div>
        )}
      </section>

      {/* Suscripciones creadas */}
      {subscriptions.length > 0 && (
        <div className="mb-8">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">
            Suscripciones creadas
          </h3>
          <div className="overflow-x-auto rounded border border-gray-200">
            <table className="min-w-full text-xs text-gray-700">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-gray-500">
                    ID
                  </th>
                  <th className="px-3 py-2 text-left font-medium text-gray-500">
                    Status
                  </th>
                  <th className="px-3 py-2 text-left font-medium text-gray-500">
                    MP ID
                  </th>
                  <th className="px-3 py-2 text-left font-medium text-gray-500">
                    Tokenization
                  </th>
                  <th className="px-3 py-2 text-left font-medium text-gray-500">
                    Created at
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {subscriptions.map((sub) => (
                  <tr key={sub.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2 font-mono break-all">{sub.id}</td>
                    <td className="px-3 py-2">
                      {sub.status ?? "—"}
                      {/* Fix #5: informational note for pending_redirect rows */}
                      {sub.status === "pending_redirect" && (
                        <span className="block text-xs text-blue-600 mt-0.5">
                          Esperando que el pagador complete el checkout
                          {sub.initPoint && (
                            <>
                              {" — "}
                              <a
                                href={sub.initPoint}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="underline hover:text-blue-800"
                              >
                                Abrir link
                              </a>
                            </>
                          )}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs break-all">
                      {sub.mpId ?? "—"}
                    </td>
                    <td className="px-3 py-2">{sub.tokenization ?? "—"}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {sub.createdAt}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Webhook events */}
      <WebhookList method="a3_plan" />
    </div>
  );
}
