import { useState, useEffect, useCallback } from "react";
import { ResponsePanel } from "../components/ResponsePanel.js";
import { WebhookList } from "../components/WebhookList.js";
import { TimelineView } from "../components/TimelineView.js";
import { Card } from "../components/Card.js";
import { StatusBadge } from "../components/StatusBadge.js";
import { AdvancedSection } from "../components/AdvancedSection.js";
import { CardFormMpJs } from "../components/CardFormMpJs.js";
import { CardBrick } from "../components/CardBrick.js";
import { SubViewToggle } from "../components/SubViewToggle.js";
import { NotesView } from "../components/NotesView.js";
import { createA2, searchA2, listA2, getA2Detail, deleteA2, deleteAllA2 } from "../api.js";
import { PaymentsDiag } from "../components/PaymentsDiag.js";
import type { SubscriptionResponse, SubscriptionDetailResponse, Tokenization } from "shared";
import { MP_PUBLIC_KEY as PUBLIC_KEY } from "../config.js";

type SubView = "main" | "notas";
type TokenizationMode = "mercadopagojs" | "brick";

interface FormState {
  reason: string;
  payerEmail: string;
  externalReference: string;
  frequency: string;
  frequencyType: "months" | "days";
  amount: string;
  currency: string;
  startDate: string;
  // Advanced
  backUrl: string;
  endDate: string;
  freeTrialFrequency: string;
  freeTrialFrequencyType: "months" | "days";
  freeTrialFirstInvoiceOffset: string;
  repetitions: string;
}

function tomorrow(): string {
  const d = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    d.getFullYear() +
    "-" +
    pad(d.getMonth() + 1) +
    "-" +
    pad(d.getDate()) +
    "T" +
    pad(d.getHours()) +
    ":" +
    pad(d.getMinutes())
  );
}


export function A2Authorized() {
  const [subView, setSubView] = useState<SubView>("main");

  const [tokenizationMode, setTokenizationMode] = useState<TokenizationMode>("mercadopagojs");
  const [cardTokenId, setCardTokenId] = useState<string | null>(null);
  const [tokenSource, setTokenSource] = useState<Tokenization | null>(null);

  const [form, setForm] = useState<FormState>({
    reason: "",
    payerEmail: "",
    externalReference: "",
    frequency: "1",
    frequencyType: "months",
    amount: "",
    currency: "ARS",
    startDate: tomorrow(),
    // Advanced
    backUrl: "",
    endDate: "",
    freeTrialFrequency: "",
    freeTrialFrequencyType: "months",
    freeTrialFirstInvoiceOffset: "",
    repetitions: "",
  });

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [createResult, setCreateResult] = useState<SubscriptionResponse | null>(null);
  const [history, setHistory] = useState<SubscriptionResponse[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<SubscriptionDetailResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [searchResult, setSearchResult] = useState<unknown>(null);
  const [searching, setSearching] = useState(false);
  const [searchMpId, setSearchMpId] = useState("");
  const [searchError, setSearchError] = useState<string | null>(null);
  const [deletingAll, setDeletingAll] = useState(false);

  const fetchHistory = useCallback(async () => {
    try {
      const rows = await listA2();
      setHistory(rows);
    } catch {
      // non-critical
    }
  }, []);

  useEffect(() => {
    void fetchHistory();
  }, [fetchHistory]);

  const fetchDetail = useCallback(async (id: string) => {
    setDetailLoading(true);
    try {
      const d = await getA2Detail(id);
      setDetail(d);
    } catch {
      // non-critical
    } finally {
      setDetailLoading(false);
    }
  }, []);

  async function handleDelete(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (!window.confirm("¿Eliminar este registro del historial? (borrado lógico, los datos se conservan)")) return;
    try {
      await deleteA2(id);
      await fetchHistory();
      if (selectedId === id) {
        setSelectedId(null);
        setDetail(null);
        setSearchResult(null);
      }
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "No se pudo eliminar");
    }
  }

  function selectSubscription(id: string) {
    // H2: removed early-return so re-clicking always refetches the detail
    setSelectedId(id);
    setDetail(null);
    setSearchResult(null);
    setSearchMpId("");
    setSearchError(null);
    void fetchDetail(id);
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  function handleToken(tokenId: string) {
    setCardTokenId(tokenId);
    setTokenSource(tokenizationMode);
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!cardTokenId || !tokenSource) {
      setError(new Error("Tokenize the card first using one of the methods above."));
      return;
    }
    setSubmitting(true);
    try {
      const freeTrial =
        form.freeTrialFrequency
          ? {
              frequency: Number(form.freeTrialFrequency),
              frequencyType: form.freeTrialFrequencyType,
              ...(form.freeTrialFirstInvoiceOffset
                ? { firstInvoiceOffset: Number(form.freeTrialFirstInvoiceOffset) }
                : {}),
            }
          : undefined;

      const payload: Parameters<typeof createA2>[0] = {
        reason: form.reason,
        payerEmail: form.payerEmail,
        cardTokenId,
        tokenization: tokenSource,
        autoRecurring: {
          frequency: Number(form.frequency),
          frequencyType: form.frequencyType,
          amount: Number(form.amount),
          currency: form.currency,
          startDate: form.startDate
            ? new Date(form.startDate).toISOString()
            : undefined,
          ...(form.endDate ? { endDate: new Date(form.endDate).toISOString() } : {}),
          ...(freeTrial ? { freeTrial } : {}),
          ...(form.repetitions ? { repetitions: Number(form.repetitions) } : {}),
        },
      };
      if (form.externalReference) payload.externalReference = form.externalReference;
      if (form.backUrl) payload.backUrl = form.backUrl;
      const result = await createA2(payload);
      setCreateResult(result);
      setCardTokenId(null);
      setTokenSource(null);
      await fetchHistory();
      setSelectedId(result.id);
      void fetchDetail(result.id);
    } catch (err) {
      setError(err instanceof Error ? err : new Error("Request failed"));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSearch() {
    const targetId = searchMpId || selectedId;
    if (!targetId) return;
    setSearching(true);
    setSearchError(null);
    try {
      const result = await searchA2(targetId);
      setSearchResult(result);
      if (selectedId) void fetchDetail(selectedId);
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setSearching(false);
    }
  }

  const selectedSub = history.find((s) => s.id === selectedId);

  return (
    <div>
      <div className="mb-4">
        <h2 className="text-xl font-semibold text-gray-900 mb-1">A.2 — Preapproval Authorized</h2>
        <p className="text-sm text-gray-500">
          Creates a preapproval with{" "}
          <code className="text-xs bg-gray-100 px-1 rounded">status: authorized</code>{" "}
          using a card token. No MP checkout redirect required.
        </p>
      </div>

      <div className="mb-6">
        <SubViewToggle
          value={subView}
          onChange={setSubView}
          opts={[
            { key: "main", label: "Suscripciones" },
            { key: "notas", label: "Notas" },
          ]}
        />
      </div>

      {subView === "notas" ? (
        <NotesView method="a2_authorized" />
      ) : (
      <div className="grid grid-cols-1 lg:grid-cols-[18rem_1fr] gap-6">
        {/* ── Left sidebar ── */}
        <aside className="space-y-2">
          <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-200 px-4 py-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-900">Suscripciones</h3>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400">{history.length}</span>
                {history.length > 0 && (
                  <button
                    type="button"
                    disabled={deletingAll}
                    onClick={async () => {
                      if (!window.confirm("¿Eliminar TODO el historial de esta sección? (borrado lógico, los datos se conservan)")) return;
                      setDeletingAll(true);
                      try {
                        await deleteAllA2();
                        await fetchHistory();
                        setSelectedId(null);
                        setDetail(null);
                        setSearchResult(null);
                      } catch (err) {
                        window.alert(err instanceof Error ? err.message : "No se pudo eliminar");
                      } finally {
                        setDeletingAll(false);
                      }
                    }}
                    className="text-xs text-red-400 hover:text-red-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Eliminar todo
                  </button>
                )}
              </div>
            </div>
            <ul className="divide-y divide-gray-100 max-h-96 overflow-y-auto">
              {history.length === 0 && (
                <li className="px-4 py-3 text-xs text-gray-400 italic">None yet.</li>
              )}
              {history.map((sub) => (
                <li key={sub.id} className="relative group">
                  <button
                    type="button"
                    onClick={() => selectSubscription(sub.id)}
                    className={[
                      "w-full text-left px-4 py-3 text-xs hover:bg-gray-50 transition-colors pr-8",
                      selectedId === sub.id ? "bg-blue-50 border-l-2 border-blue-500" : "",
                    ].join(" ")}
                  >
                    <div className="font-mono text-gray-700 truncate">{sub.id.slice(0, 16)}…</div>
                    <div className="flex items-center gap-2 mt-1">
                      <StatusBadge status={sub.status} />
                      {sub.tokenization && (
                        <span className="text-gray-400 truncate">{sub.tokenization}</span>
                      )}
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => void handleDelete(sub.id, e)}
                    title="Eliminar del historial (borrado lógico)"
                    className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 transition-all p-1"
                  >
                    🗑
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </aside>

        {/* ── Right main column ── */}
        <div className="space-y-4 min-w-0">
          {/* Create card */}
          <Card title="Crear suscripción (authorized)">
            {/* Step 1 — Tokenize */}
            <div className="mb-6">
              <p className="text-sm font-medium text-gray-700 mb-2">Step 1 — Tokenize card</p>
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
                  <CardBrick key={`brick-${tokenizationMode}`} publicKey={PUBLIC_KEY} onToken={handleToken} />
                )}
              </div>
              {cardTokenId && (
                <p className="mt-2 text-xs text-green-700 bg-green-50 border border-green-200 rounded px-3 py-2">
                  Card token ready (via <span className="font-mono">{tokenSource}</span>). Submit the form below.
                </p>
              )}
            </div>

            {/* Step 2 — Subscription details */}
            <form onSubmit={handleSubmit} className="space-y-4">
              <p className="text-sm font-medium text-gray-700">Step 2 — Subscription details</p>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Reason</label>
                <input
                  type="text"
                  name="reason"
                  value={form.reason}
                  onChange={handleChange}
                  required
                  placeholder="Monthly plan"
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Payer email</label>
                <input
                  type="email"
                  name="payerEmail"
                  value={form.payerEmail}
                  onChange={handleChange}
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
                  name="externalReference"
                  value={form.externalReference}
                  onChange={handleChange}
                  placeholder="order-123"
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
                      name="frequency"
                      value={form.frequency}
                      onChange={handleChange}
                      min="1"
                      required
                      className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
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
                    <label className="block text-sm font-medium text-gray-700 mb-1">Amount</label>
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
                    <label className="block text-sm font-medium text-gray-700 mb-1">Currency</label>
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
                    Start date <span className="text-gray-400 font-normal">(defaults to tomorrow)</span>
                  </label>
                  <input
                    type="datetime-local"
                    name="startDate"
                    value={form.startDate}
                    onChange={handleChange}
                    className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </fieldset>
              <AdvancedSection>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Back URL <span className="text-gray-400 font-normal">(optional)</span>
                  </label>
                  <input
                    type="url"
                    name="backUrl"
                    value={form.backUrl}
                    onChange={handleChange}
                    placeholder="https://example.com/return"
                    className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    End date <span className="text-gray-400 font-normal">(autoRecurring.endDate, optional)</span>
                  </label>
                  <input
                    type="datetime-local"
                    name="endDate"
                    value={form.endDate}
                    onChange={handleChange}
                    className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Repetitions <span className="text-gray-400 font-normal">(autoRecurring.repetitions, optional)</span>
                  </label>
                  <input
                    type="number"
                    name="repetitions"
                    value={form.repetitions}
                    onChange={handleChange}
                    min="1"
                    placeholder="e.g. 12"
                    className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <fieldset className="border border-gray-100 rounded p-3 space-y-3">
                  <legend className="text-xs font-medium text-gray-600 px-1">Free trial (optional — fill frequency to enable)</legend>
                  <div className="flex gap-3">
                    <div className="flex-1">
                      <label className="block text-xs font-medium text-gray-700 mb-1">Frequency</label>
                      <input
                        type="number"
                        name="freeTrialFrequency"
                        value={form.freeTrialFrequency}
                        onChange={handleChange}
                        min="1"
                        placeholder="e.g. 1"
                        className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div className="flex-1">
                      <label className="block text-xs font-medium text-gray-700 mb-1">Type</label>
                      <select
                        name="freeTrialFrequencyType"
                        value={form.freeTrialFrequencyType}
                        onChange={handleChange}
                        className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="months">months</option>
                        <option value="days">days</option>
                      </select>
                    </div>
                    <div className="flex-1">
                      <label className="block text-xs font-medium text-gray-700 mb-1">First invoice offset</label>
                      <input
                        type="number"
                        name="freeTrialFirstInvoiceOffset"
                        value={form.freeTrialFirstInvoiceOffset}
                        onChange={handleChange}
                        min="0"
                        placeholder="e.g. 0"
                        className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                </fieldset>
              </AdvancedSection>
              {error && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
                  {error.message}
                </p>
              )}
              <button
                type="submit"
                disabled={submitting || !cardTokenId}
                className="w-full bg-blue-600 text-white rounded px-4 py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {submitting
                  ? "Creating…"
                  : cardTokenId
                    ? "Create authorized preapproval"
                    : "Tokenize card first (Step 1)"}
              </button>
            </form>

            {createResult && <ResponsePanel data={createResult} />}
          </Card>

          {/* Search card */}
          <Card title="Buscar por ID (GET subscription)">
            <div className="space-y-3">
              <p className="text-xs text-gray-500">
                Triggers <code className="bg-gray-100 px-1 rounded">GET /:id/mp</code> and appends a new snapshot to the timeline.
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
                  {searching ? "Searching…" : "Search in MP"}
                </button>
              </div>
              {searchError && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
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
                  {selectedSub.tokenization && (
                    <span className="text-xs text-gray-400">{selectedSub.tokenization}</span>
                  )}
                  <button
                    type="button"
                    onClick={() => { if (selectedId) void fetchDetail(selectedId); }}
                    disabled={detailLoading}
                    className="ml-auto text-xs text-gray-500 hover:text-gray-700 disabled:opacity-50"
                    title="Refetch timeline"
                  >
                    {detailLoading ? "..." : "↻ Actualizar"}
                  </button>
                </div>
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

          {/* Payments diagnostic card — only shown when a subscription is selected */}
          {selectedId && <PaymentsDiag subscriptionId={selectedId} />}

          {/* Webhooks card */}
          <Card title="Webhook Events (live feed)">
            <p className="text-xs text-gray-500 mb-3">
              Method-level feed including unattributed events.
              <span className="text-gray-400"> (polling every 5s)</span>
            </p>
            <WebhookList method="a2_authorized" />
          </Card>
        </div>
      </div>
      )}
    </div>
  );
}
