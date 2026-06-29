import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
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
import { ThreeColumnLayout } from "../components/ThreeColumnLayout.js";
import { HistorySidebar } from "../components/HistorySidebar.js";
import { Pagination } from "../components/Pagination.js";
import { createA2, searchA2, listA2, getA2Detail, deleteA2, deleteAllA2, cancelSubscription } from "../api.js";
import { usePaginatedQuery } from "../hooks/usePaginatedQuery.js";
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
  const params = useParams<{ id?: string }>();
  const navigate = useNavigate();
  // URL is the source of truth for the selected entity.
  const selectedId = params.id ?? null;

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
  const [refetchToken, setRefetchToken] = useState(0);
  const [detail, setDetail] = useState<SubscriptionDetailResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [searchResult, setSearchResult] = useState<unknown>(null);
  const [searching, setSearching] = useState(false);
  const [searchMpId, setSearchMpId] = useState("");
  const [searchError, setSearchError] = useState<string | null>(null);
  const [deletingAll, setDeletingAll] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const fetcher = useCallback(
    async (p: { page: number; limit: number }) => {
      void refetchToken;
      return listA2({ page: p.page, limit: p.limit });
    },
    [refetchToken],
  );

  const {
    data: history,
    page,
    setPage,
    total,
    totalPages,
    limit,
  } = usePaginatedQuery<SubscriptionResponse>({ fetcher });

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

  // Auto-refetch detail when the URL :id changes
  useEffect(() => {
    if (selectedId) {
      void fetchDetail(selectedId);
      setDetail(null);
      setSearchResult(null);
      setSearchMpId("");
      setSearchError(null);
    } else {
      setDetail(null);
      setSearchResult(null);
    }
  }, [selectedId, fetchDetail]);

  async function handleDelete(id: string) {
    if (!window.confirm("¿Eliminar este registro del historial? (borrado lógico, los datos se conservan)")) return;
    try {
      await deleteA2(id);
      setRefetchToken((n) => n + 1);
      if (selectedId === id) {
        navigate("/a2");
        setDetail(null);
        setSearchResult(null);
      }
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "No se pudo eliminar");
    }
  }

  async function handleClearAll() {
    if (deletingAll) return;
    if (!window.confirm("¿Eliminar TODO el historial de esta sección? (borrado lógico, los datos se conservan)")) return;
    setDeletingAll(true);
    try {
      await deleteAllA2();
      setRefetchToken((n) => n + 1);
      navigate("/a2");
      setDetail(null);
      setSearchResult(null);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "No se pudo eliminar");
    } finally {
      setDeletingAll(false);
    }
  }

  function selectSubscription(id: string) {
    navigate(`/a2/${encodeURIComponent(id)}`);
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
      setRefetchToken((n) => n + 1);
      navigate(`/a2/${encodeURIComponent(result.id)}`);
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

  async function handleCancel() {
    if (!selectedId) return;
    const confirmed = window.confirm(
      "¿Cancelar esta suscripción en MercadoPago? Es IRREVERSIBLE y deja de cobrar.",
    );
    if (!confirmed) return;
    setCancelling(true);
    try {
      await cancelSubscription(selectedId);
      setRefetchToken((n) => n + 1);
      void fetchDetail(selectedId);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "No se pudo cancelar");
    } finally {
      setCancelling(false);
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
          onChange={(v) => {
            if (v === "notas") {
              navigate("/notes?method=a2_authorized");
            } else {
              setSubView(v);
            }
          }}
          opts={[
            { key: "main", label: "Suscripciones" },
            { key: "notas", label: "Notas" },
          ]}
        />
      </div>

      {subView === "notas" ? (
        <NotesView method="a2_authorized" />
      ) : (
        <ThreeColumnLayout
          sidebar={
            <HistorySidebar
              title="Suscripciones"
              items={history}
              selectedId={selectedId}
              onSelect={selectSubscription}
              getId={(s) => s.id}
              onDelete={handleDelete}
              onClearAll={handleClearAll}
              footer={
                <Pagination
                  page={page}
                  totalPages={totalPages}
                  total={total}
                  limit={limit}
                  onPageChange={setPage}
                />
              }
              renderItem={(sub) => (
                <>
                  <div className="font-mono text-gray-700 truncate">{sub.id.slice(0, 16)}…</div>
                  <div className="flex items-center gap-2 mt-1">
                    <StatusBadge status={sub.status} />
                    {sub.tokenization && (
                      <span className="text-gray-400 truncate">{sub.tokenization}</span>
                    )}
                  </div>
                </>
              )}
            />
          }
          form={
            <div className="space-y-4 min-w-0">
              {/* Step 1 + Step 2 grouped in a single Card, per spec */}
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
            </div>
          }
          data={
            <>
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
                      {selectedSub.status !== "cancelled" && (
                        <button
                          type="button"
                          onClick={() => void handleCancel()}
                          disabled={cancelling || detailLoading}
                          className="ml-auto text-xs font-medium text-red-600 border border-red-300 rounded px-2 py-0.5 hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                          title="Cancelar en MercadoPago (irreversible)"
                        >
                          {cancelling ? "Cancelando…" : "Cancelar en MP"}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => { if (selectedId) void fetchDetail(selectedId); }}
                        disabled={detailLoading}
                        className={`${selectedSub.status !== "cancelled" ? "" : "ml-auto "}text-xs text-gray-500 hover:text-gray-700 disabled:opacity-50`}
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
                    Select a subscription from the sidebar to view its details, payments and webhooks.
                  </p>
                )}
              </Card>

              {/* Payments diagnostic card — only shown when a subscription is selected */}
              {selectedId && <PaymentsDiag subscriptionId={selectedId} />}

              {/* Webhooks card */}
              <Card title="Webhook Events (live feed)">
                <p className="text-xs text-gray-500 mb-3">
                  {selectedId
                    ? `Live feed for subscription ${selectedId.slice(0, 8)}…`
                    : "Method-level feed including unattributed events."}
                </p>
                <WebhookList method="a2_authorized" subscriptionId={selectedId ?? undefined} />
              </Card>
            </>
          }
        />
      )}
    </div>
  );
}
