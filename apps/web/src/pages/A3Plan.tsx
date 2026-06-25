import { useState, useEffect, useCallback } from "react";
import { ResponsePanel } from "../components/ResponsePanel.js";
import { WebhookList } from "../components/WebhookList.js";
import { TimelineView } from "../components/TimelineView.js";
import { Card } from "../components/Card.js";
import { CardFormMpJs } from "../components/CardFormMpJs.js";
import { CardBrick } from "../components/CardBrick.js";
import {
  createPlan,
  listA3Plans,
  subscribeToPlan,
  listA3,
  searchA3,
  getA3Detail,
} from "../api.js";
import type {
  PlanResponse,
  SubscribeResult,
} from "../api.js";
import type { SubscriptionResponse, SubscriptionDetailResponse, Tokenization } from "shared";

const PUBLIC_KEY = import.meta.env.VITE_MP_PUBLIC_KEY as string;

type TokenizationMode = "mercadopagojs" | "brick";
type SubscribePath = "redirect" | "api";

interface PlanFormState {
  reason: string;
  frequency: string;
  frequencyType: "months" | "days";
  amount: string;
  currency: string;
  billingDay: string;
}

function StatusBadge({ status }: { status: string | null }) {
  const s = status ?? "unknown";
  const cls =
    s === "authorized"
      ? "bg-green-100 text-green-700"
      : s === "pending"
        ? "bg-yellow-100 text-yellow-700"
        : s === "pending_redirect"
          ? "bg-blue-100 text-blue-700"
          : s === "cancelled"
            ? "bg-red-100 text-red-700"
            : "bg-gray-100 text-gray-600";
  return (
    <span className={`text-xs rounded px-1.5 py-0.5 font-medium ${cls}`}>{s}</span>
  );
}

// ---------------------------------------------------------------------------
// Plan picker
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
  const selectablePlans = plans.filter((p) => p.mpPlanId);

  if (plans.length === 0) {
    return (
      <p className="text-sm text-gray-500 italic">
        No plans created yet — use the Create Plan card first.
      </p>
    );
  }

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">Select plan</label>
      <select
        value={selectedId}
        onChange={(e) => onSelect(e.target.value)}
        className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        <option value="">— choose a plan —</option>
        {selectablePlans.map((p) => (
          <option key={p.id} value={p.mpPlanId!}>
            {p.reason ?? "Unnamed plan"} — {p.amount} {p.currency} / {p.frequency} {p.frequencyType} ({p.mpPlanId})
          </option>
        ))}
        {plans.filter((p) => !p.mpPlanId).map((p) => (
          <option key={p.id} value="" disabled>
            {p.reason ?? "Unnamed plan"} (no mpPlanId — not selectable)
          </option>
        ))}
      </select>
    </div>
  );
}

// ---------------------------------------------------------------------------
// A3Plan page
// ---------------------------------------------------------------------------

export function A3Plan() {
  const [plans, setPlans] = useState<PlanResponse[]>([]);
  const [subscriptions, setSubscriptions] = useState<SubscriptionResponse[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<SubscriptionDetailResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Create plan form
  const [planForm, setPlanForm] = useState<PlanFormState>({
    reason: "",
    frequency: "1",
    frequencyType: "months",
    amount: "",
    currency: "ARS",
    billingDay: "",
  });
  const [planSubmitting, setPlanSubmitting] = useState(false);
  const [planError, setPlanError] = useState<Error | null>(null);
  const [planResult, setPlanResult] = useState<PlanResponse | null>(null);

  // Subscribe form
  const [selectedPlanMpId, setSelectedPlanMpId] = useState("");
  const [payerEmail, setPayerEmail] = useState("");
  const [externalReference, setExternalReference] = useState("");
  const [subscribePath, setSubscribePath] = useState<SubscribePath>("redirect");
  const [tokenizationMode, setTokenizationMode] = useState<TokenizationMode>("mercadopagojs");
  const [cardTokenId, setCardTokenId] = useState<string | null>(null);
  const [tokenSource, setTokenSource] = useState<Tokenization | null>(null);
  const [subSubmitting, setSubSubmitting] = useState(false);
  const [subError, setSubError] = useState<Error | null>(null);
  const [subResult, setSubResult] = useState<SubscribeResult | null>(null);

  // Search
  const [searchMpId, setSearchMpId] = useState("");
  const [searchResult, setSearchResult] = useState<unknown>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchIsInfo, setSearchIsInfo] = useState(false);

  const fetchPlans = useCallback(async () => {
    try {
      const rows = await listA3Plans();
      setPlans(rows);
    } catch {
      // non-critical
    }
  }, []);

  const fetchSubscriptions = useCallback(async () => {
    try {
      const rows = await listA3();
      setSubscriptions(rows);
    } catch {
      // non-critical
    }
  }, []);

  useEffect(() => {
    void fetchPlans();
    void fetchSubscriptions();
  }, [fetchPlans, fetchSubscriptions]);

  const fetchDetail = useCallback(async (id: string) => {
    setDetailLoading(true);
    try {
      const d = await getA3Detail(id);
      setDetail(d);
    } catch {
      // non-critical
    } finally {
      setDetailLoading(false);
    }
  }, []);

  function selectSubscription(id: string) {
    if (selectedId === id) return;
    setSelectedId(id);
    setDetail(null);
    setSearchResult(null);
    setSearchMpId("");
    setSearchError(null);
    void fetchDetail(id);
  }

  // Plan creation handler
  async function handleCreatePlan(e: React.FormEvent) {
    e.preventDefault();
    setPlanError(null);
    setPlanSubmitting(true);
    try {
      const payload: Parameters<typeof createPlan>[0] = {
        reason: planForm.reason,
        autoRecurring: {
          frequency: Number(planForm.frequency),
          frequencyType: planForm.frequencyType,
          amount: Number(planForm.amount),
          currency: planForm.currency,
        },
      };
      if (planForm.billingDay) payload.billingDay = Number(planForm.billingDay);
      const created = await createPlan(payload);
      setPlanResult(created);
      setPlans((prev) => [created, ...prev]);
    } catch (err) {
      setPlanError(err instanceof Error ? err : new Error("Request failed"));
    } finally {
      setPlanSubmitting(false);
    }
  }

  // Subscribe handler
  async function handleSubscribe(e: React.FormEvent) {
    e.preventDefault();
    setSubError(null);
    if (!selectedPlanMpId) {
      setSubError(new Error("Select a plan first."));
      return;
    }
    if (subscribePath === "api" && !cardTokenId) {
      setSubError(new Error("Tokenize the card first."));
      return;
    }
    setSubSubmitting(true);
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
      setSubResult(res);
      setCardTokenId(null);
      setTokenSource(null);
      await fetchSubscriptions();
      // Auto-select newly created subscription
      setSelectedId(res.id);
      void fetchDetail(res.id);
    } catch (err) {
      setSubError(err instanceof Error ? err : new Error("Request failed"));
    } finally {
      setSubSubmitting(false);
    }
  }

  // Search handler
  async function handleSearch() {
    const targetId = searchMpId || selectedId;
    if (!targetId) return;
    setSearchError(null);
    setSearchIsInfo(false);
    setSearchResult(null);

    const targetSub = subscriptions.find((s) => s.id === targetId);
    if (targetSub?.status === "pending_redirect") {
      setSearchIsInfo(true);
      setSearchError(
        "Esta suscripción está esperando que el pagador complete el checkout." +
          (targetSub.initPoint ? ` Init point: ${targetSub.initPoint}` : ""),
      );
      return;
    }

    setSearching(true);
    try {
      const result = await searchA3(targetId);
      setSearchResult(result);
      if (selectedId) void fetchDetail(selectedId);
    } catch (err) {
      setSearchIsInfo(false);
      setSearchError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setSearching(false);
    }
  }

  const selectedSub = subscriptions.find((s) => s.id === selectedId);

  return (
    <div>
      <div className="mb-4">
        <h2 className="text-xl font-semibold text-gray-900 mb-1">A.3 — Preapproval Plan</h2>
        <p className="text-sm text-gray-500">
          Two-step flow: create a plan template, then subscribe a payer either via checkout redirect or directly via API with a card token.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[18rem_1fr] gap-6">
        {/* ── Left sidebar ── */}
        <aside className="space-y-2">
          <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-200 px-4 py-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-900">Suscripciones</h3>
              <span className="text-xs text-gray-400">{subscriptions.length}</span>
            </div>
            <ul className="divide-y divide-gray-100 max-h-96 overflow-y-auto">
              {subscriptions.length === 0 && (
                <li className="px-4 py-3 text-xs text-gray-400 italic">None yet.</li>
              )}
              {subscriptions.map((sub) => (
                <li key={sub.id}>
                  <button
                    type="button"
                    onClick={() => selectSubscription(sub.id)}
                    className={[
                      "w-full text-left px-4 py-3 text-xs hover:bg-gray-50 transition-colors",
                      selectedId === sub.id ? "bg-blue-50 border-l-2 border-blue-500" : "",
                    ].join(" ")}
                  >
                    <div className="font-mono text-gray-700 truncate">{sub.id.slice(0, 16)}…</div>
                    <div className="flex items-center gap-2 mt-1">
                      <StatusBadge status={sub.status} />
                      <span className="text-gray-400">
                        {new Date(sub.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </aside>

        {/* ── Right main column ── */}
        <div className="space-y-4 min-w-0">
          {/* Create plan card */}
          <Card title="Crear plan (PreApprovalPlan)">
            <form onSubmit={handleCreatePlan} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Reason</label>
                <input
                  type="text"
                  value={planForm.reason}
                  onChange={(e) => setPlanForm((p) => ({ ...p, reason: e.target.value }))}
                  required
                  placeholder="Monthly premium plan"
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <fieldset className="border border-gray-200 rounded p-4 space-y-4">
                <legend className="text-sm font-medium text-gray-700 px-1">Auto-recurring billing</legend>
                <div className="flex gap-4">
                  <div className="flex-1">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Frequency</label>
                    <input
                      type="number"
                      value={planForm.frequency}
                      onChange={(e) => setPlanForm((p) => ({ ...p, frequency: e.target.value }))}
                      min="1"
                      required
                      className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                    <select
                      value={planForm.frequencyType}
                      onChange={(e) => setPlanForm((p) => ({ ...p, frequencyType: e.target.value as "months" | "days" }))}
                      className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="months">months</option>
                      <option value="days">days</option>
                    </select>
                  </div>
                </div>
                <div className="flex gap-4">
                  <div className="flex-1">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Amount</label>
                    <input
                      type="number"
                      value={planForm.amount}
                      onChange={(e) => setPlanForm((p) => ({ ...p, amount: e.target.value }))}
                      min="0.01"
                      step="0.01"
                      required
                      placeholder="1000"
                      className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div className="w-28">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Currency</label>
                    <input
                      type="text"
                      value={planForm.currency}
                      onChange={(e) => setPlanForm((p) => ({ ...p, currency: e.target.value }))}
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
                    Billing day <span className="text-gray-400 font-normal">(optional, 1–28)</span>
                  </label>
                  <input
                    type="number"
                    value={planForm.billingDay}
                    onChange={(e) => setPlanForm((p) => ({ ...p, billingDay: e.target.value }))}
                    min="1"
                    max="28"
                    placeholder="Leave empty for default"
                    className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </fieldset>
              {planError && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
                  {planError.message}
                </p>
              )}
              <button
                type="submit"
                disabled={planSubmitting}
                className="w-full bg-blue-600 text-white rounded px-4 py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {planSubmitting ? "Creating…" : "Create plan"}
              </button>
            </form>
            {planResult && (
              <div className="mt-4 space-y-3">
                {planResult.initPoint && (
                  <div className="bg-blue-50 border border-blue-200 rounded px-4 py-3">
                    <p className="text-xs font-semibold text-blue-700 mb-1 uppercase tracking-wide">
                      Plan init_point (public checkout link)
                    </p>
                    <a
                      href={planResult.initPoint}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-blue-600 underline break-all hover:text-blue-800"
                    >
                      {planResult.initPoint}
                    </a>
                  </div>
                )}
                <ResponsePanel data={planResult} />
              </div>
            )}
          </Card>

          {/* Subscribe card */}
          <Card title="Suscribir pagador">
            <form onSubmit={handleSubscribe} className="space-y-4">
              <PlanPicker plans={plans} selectedId={selectedPlanMpId} onSelect={setSelectedPlanMpId} />

              {/* Show plan init_point shortcut */}
              {(() => {
                const selPlan = plans.find((p) => p.mpPlanId === selectedPlanMpId);
                return selPlan?.initPoint ? (
                  <div className="bg-gray-50 border border-gray-200 rounded px-4 py-3 flex items-center justify-between gap-4">
                    <span className="text-xs text-gray-500 truncate">{selPlan.initPoint}</span>
                    <a
                      href={selPlan.initPoint}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0 bg-gray-800 text-white text-xs rounded px-3 py-1.5 font-medium hover:bg-gray-900 transition-colors"
                    >
                      Abrir checkout del plan
                    </a>
                  </div>
                ) : null;
              })()}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Payer email</label>
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
                  External reference <span className="text-gray-400 font-normal">(optional)</span>
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
                <p className="text-sm font-medium text-gray-700 mb-2">Subscribe path</p>
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

              {/* Tokenization — only for API path */}
              {subscribePath === "api" && (
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-2">Tokenization method</p>
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
                      <CardFormMpJs publicKey={PUBLIC_KEY} onToken={(id) => { setCardTokenId(id); setTokenSource(tokenizationMode); setSubError(null); }} />
                    ) : (
                      <CardBrick
                        key={`brick-${tokenizationMode}`}
                        publicKey={PUBLIC_KEY}
                        onToken={(id) => { setCardTokenId(id); setTokenSource(tokenizationMode); setSubError(null); }}
                      />
                    )}
                  </div>
                  {cardTokenId && (
                    <p className="mt-2 text-xs text-green-700 bg-green-50 border border-green-200 rounded px-3 py-2">
                      Card token ready (via <span className="font-mono">{tokenSource}</span>). Submit to create the subscription.
                    </p>
                  )}
                </div>
              )}

              {subError && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
                  {subError.message}
                </p>
              )}

              <button
                type="submit"
                disabled={subSubmitting || (subscribePath === "api" && !cardTokenId)}
                className="w-full bg-blue-600 text-white rounded px-4 py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {subSubmitting
                  ? "Processing…"
                  : subscribePath === "redirect"
                    ? "Subscribe via init_point"
                    : cardTokenId
                      ? "Subscribe via API"
                      : "Tokenize card first"}
              </button>
            </form>

            {subResult && (
              <div className="mt-4 space-y-3">
                {subResult.path === "redirect" && subResult.initPoint && (
                  <div className="bg-blue-50 border border-blue-200 rounded px-4 py-3">
                    <p className="text-xs font-semibold text-blue-700 mb-1 uppercase tracking-wide">
                      Redirect payer to this link
                    </p>
                    <a
                      href={subResult.initPoint}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-blue-600 underline break-all hover:text-blue-800"
                    >
                      {subResult.initPoint}
                    </a>
                  </div>
                )}
                <ResponsePanel data={subResult} />
              </div>
            )}
          </Card>

          {/* Search card */}
          <Card title="Buscar por ID (GET subscription)">
            <div className="space-y-3">
              <p className="text-xs text-gray-500">
                Triggers <code className="bg-gray-100 px-1 rounded">GET /:id/mp</code> and appends a new snapshot.
              </p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={searchMpId}
                  onChange={(e) => setSearchMpId(e.target.value)}
                  placeholder={selectedId ? `${selectedId.slice(0, 20)}… (selected)` : "Local subscription ID"}
                  className="flex-1 border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  type="button"
                  onClick={handleSearch}
                  disabled={searching || (!searchMpId && !selectedId)}
                  className="bg-gray-700 text-white rounded px-4 py-2 text-sm font-medium hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
                >
                  {searching ? "Searching…" : "Buscar en MP"}
                </button>
              </div>
              {searchError && (
                <p
                  className={[
                    "text-sm rounded px-3 py-2 border",
                    searchIsInfo
                      ? "text-blue-700 bg-blue-50 border-blue-200"
                      : "text-red-600 bg-red-50 border-red-200",
                  ].join(" ")}
                >
                  {searchError}
                </p>
              )}
              {searchResult !== null && <ResponsePanel data={searchResult} />}
            </div>
          </Card>

          {/* Timeline card */}
          <Card title="Timeline">
            {selectedSub ? (
              <div>
                <div className="flex items-center gap-2 mb-4 pb-2 border-b border-gray-100">
                  <span className="text-xs text-gray-500 font-mono">{selectedSub.id}</span>
                  <StatusBadge status={selectedSub.status} />
                </div>
                {selectedSub.status === "pending_redirect" && selectedSub.initPoint && (
                  <div className="mb-4 p-2 bg-blue-50 border border-blue-200 rounded text-xs text-blue-700">
                    Esperando checkout —{" "}
                    <a
                      href={selectedSub.initPoint}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline"
                    >
                      Abrir link
                    </a>
                  </div>
                )}
                <TimelineView
                  entries={detail?.timeline ?? []}
                  loading={detailLoading}
                />
              </div>
            ) : (
              <p className="text-sm text-gray-400 italic">
                Select a subscription from the sidebar to see its timeline.
              </p>
            )}
          </Card>

          {/* Webhooks card */}
          <Card title="Webhook Events (live feed)">
            <p className="text-xs text-gray-500 mb-3">
              Method-level feed including unattributed events.
              <span className="text-gray-400"> (polling every 5s)</span>
            </p>
            <WebhookList method="a3_plan" />
          </Card>
        </div>
      </div>
    </div>
  );
}
