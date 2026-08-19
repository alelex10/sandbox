import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ResponsePanel } from "../components/ResponsePanel.js";
import { WebhookList } from "../components/WebhookList.js";
import { TimelineView } from "../components/TimelineView.js";
import { Card } from "../components/Card.js";
import { StatusBadge } from "../components/StatusBadge.js";
import { AdvancedSection } from "../components/AdvancedSection.js";
import { CardFormMpJs } from "../components/CardFormMpJs.js";
import { CardBrick } from "../components/CardBrick.js";
import { HistorySidebar } from "../components/HistorySidebar.js";
import { Pagination } from "../components/Pagination.js";
import { MasterDetail } from "../components/MasterDetail.js";
import { RequestFieldsView } from "../components/RequestFieldsView.js";
import { SubViewToggle } from "../components/SubViewToggle.js";
import {
  createA2,
  searchA2,
  listA2,
  getA2Detail,
  deleteA2,
  deleteAllA2,
  cancelSubscription,
  previewA2,
} from "../api.js";
import { usePaginatedQuery } from "../hooks/usePaginatedQuery.js";
import { PaymentsDiag } from "../components/PaymentsDiag.js";
import { buildDefaultReason } from "shared";
import type { SubscriptionResponse, SubscriptionDetailResponse, Tokenization } from "shared";
import { MP_PUBLIC_KEY as PUBLIC_KEY } from "../config.js";

type TokenizationMode = "mercadopagojs" | "brick";

interface FormState {
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

// Secondary sub-nav (local state, not URL-driven): "Lista" shows the
// existing master-detail history view unchanged; "Crear" shows the
// full-page two-column create view (form incl. card tokenization + live
// "Solicitud MP" preview).
type SubView = "lista" | "crear";

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
  // URL is the source of truth for the selected entity. A null URL param
  // (i.e., we're on /a2) means nothing is selected.
  const selectedId = params.id ?? null;

  // Sub-view is transient UI state, not in the URL. Switches back to
  // "lista" on URL change (see the selectedId-effect below) so a stale
  // create form never appears on top of a different entity's detail.
  const [subView, setSubView] = useState<SubView>("lista");

  // Cancel-menu state (Timeline header `…` overflow). Same outside-click
  // close pattern as HistorySidebar's `…` menu.
  const [cancelMenuOpen, setCancelMenuOpen] = useState(false);
  const cancelMenuRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!cancelMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (cancelMenuRef.current && !cancelMenuRef.current.contains(e.target as Node)) {
        setCancelMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [cancelMenuOpen]);

  const [tokenizationMode, setTokenizationMode] = useState<TokenizationMode>("mercadopagojs");
  const [cardTokenId, setCardTokenId] = useState<string | null>(null);
  const [tokenSource, setTokenSource] = useState<Tokenization | null>(null);

  const [form, setForm] = useState<FormState>({
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

  // T6 — visual pre-fill: the reason input is pre-filled with the computed
  // default. `isReasonPristine` tracks whether the user has touched the field;
  // if they haven't, submit sends an empty reason so the API fills in the
  // real seq. If they have, submit sends the user's value verbatim.
  const [reason, setReason] = useState(() =>
    buildDefaultReason({
      type: "A.2",
      channel: "tokenizacion",
      tokenization: tokenizationMode,
      paymentMethod: "card",
      seq: "0001",
    }),
  );
  const [isReasonPristine, setIsReasonPristine] = useState(true);

  // Keep the pre-filled reason in sync with the current tokenizationMode
  // (and pristine flag) so the input reflects what the user would actually
  // get if they submitted right now. The user owns the field once they
  // touch it — `isReasonPristine` flips false in the input's onChange.
  useEffect(() => {
    if (isReasonPristine) {
      setReason(
        buildDefaultReason({
          type: "A.2",
          channel: "tokenizacion",
          tokenization: tokenizationMode,
          paymentMethod: "card",
          seq: "0001",
        }),
      );
    }
    // tokenizationMode is the live state the user is currently looking at.
    // We intentionally re-run when it changes so the default updates live.
  }, [tokenizationMode, isReasonPristine]);

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

  // Auto-switch back to "Lista" on URL change. Stops a stale create form
  // from appearing on top of a different subscription's detail when the
  // user clicks another item in the sidebar.
  useEffect(() => {
    setSubView("lista");
  }, [selectedId]);

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

  // Fields shared between the real submit payload AND the "Solicitud MP"
  // live preview payload. cardTokenId/tokenization are deliberately NOT
  // included here — the real submit adds the actually-tokenized value,
  // while the preview never needs one (the server always renders a fixed
  // placeholder for card_token_id, per the non-tokenization guarantee).
  function buildCommonPayload(): Omit<Parameters<typeof createA2>[0], "cardTokenId" | "tokenization"> {
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

    const payload: Omit<Parameters<typeof createA2>[0], "cardTokenId" | "tokenization"> = {
      reason: isReasonPristine ? "" : reason,
      payerEmail: form.payerEmail,
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
    return payload;
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
      const payload: Parameters<typeof createA2>[0] = {
        ...buildCommonPayload(),
        cardTokenId,
        tokenization: tokenSource,
      };
      const result = await createA2(payload);
      setCreateResult(result);
      setCardTokenId(null);
      setTokenSource(null);
      setRefetchToken((n) => n + 1);
      // Switch back to "Lista", then auto-navigate to the new subscription.
      // The switch happens BEFORE navigate so the URL change triggers the
      // auto-switch effect's no-op (already on "lista"). The card token
      // reset (above) is the explicit "fresh form on next open" contract
      // the spec calls for.
      setSubView("lista");
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

      {/* Secondary sub-nav — "Lista" is the existing history view, "Crear"
          is the full-page two-column create view. Replaces the old
          floating "+ Crear" button + cramped create Drawer. */}
      <div className="mb-6">
        <SubViewToggle
          value={subView}
          onChange={setSubView}
          opts={[
            { key: "lista", label: "Lista" },
            { key: "crear", label: "Crear" },
          ]}
        />
      </div>

      {subView === "lista" && (
      <MasterDetail
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
                  <div className="font-mono text-gray-700 truncate">
                    {sub.reason ?? `${sub.id.slice(0, 16)}…`}
                  </div>
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
          detail={
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

              {/* Timeline card with `…` overflow menu (Cancel moved off the header). */}
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
                      {/* `…` overflow menu — destructive "Cancelar en MP" lives here, off the
                          header row. Pattern matches the HistorySidebar's `…` menu from PR1. */}
                      {selectedSub.status !== "cancelled" && (
                        <div className="relative" ref={cancelMenuRef}>
                          <button
                            type="button"
                            onClick={() => setCancelMenuOpen((v) => !v)}
                            aria-haspopup="menu"
                            aria-expanded={cancelMenuOpen}
                            aria-label="Más acciones"
                            title="Más acciones"
                            className="text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors rounded text-lg leading-none w-7 h-7 inline-flex items-center justify-center"
                          >
                            ⋯
                          </button>
                          {cancelMenuOpen && (
                            <div
                              role="menu"
                              className="absolute right-0 top-full mt-1 w-48 bg-white border border-gray-200 rounded-md shadow-lg z-20 py-1"
                            >
                              <button
                                type="button"
                                role="menuitem"
                                onClick={() => {
                                  setCancelMenuOpen(false);
                                  void handleCancel();
                                }}
                                disabled={cancelling || detailLoading}
                                className="w-full text-left px-3 py-2 text-xs text-red-600 font-medium hover:bg-red-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                title="Cancelar en MercadoPago (irreversible)"
                              >
                                {cancelling ? "Cancelando…" : "Cancelar en MP"}
                              </button>
                            </div>
                          )}
                        </div>
                      )}
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

              {/* Webhook card — hidden when no :id is selected. On A.2 webhooks
                  are only meaningful per-subscription (no "method-level feed"
                  including unattributed events like the original). */}
              {selectedId && (
                <Card title="Webhook Events (live feed)">
                  <p className="text-xs text-gray-500 mb-3">
                    Live feed for subscription {selectedId.slice(0, 8)}…
                  </p>
                  <WebhookList method="a2_authorized" subscriptionId={selectedId} />
                </Card>
              )}
            </>
          }
          fab={null}
        />
      )}

      {/* "Crear" — full-page two-column create view. Left column is the
          create form INCLUDING card tokenization (CardFormMpJs/CardBrick —
          still tokenizes client-side exactly as before); right column is
          the live "Solicitud MP" request-construction panel, fed by the
          SAME `buildCommonPayload()`/`watch` wiring the real submit uses.
          Replaces the old cramped create Drawer. */}
      {subView === "crear" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
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
                /* The `key` forces the Brick iframe to remount when the user
                   switches between MP.js v2 and Brick mid-drawer. Critical
                   for clean SDK teardown. */
                <CardBrick
                  key={`brick-${tokenizationMode}`}
                  publicKey={PUBLIC_KEY}
                  onToken={handleToken}
                />
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
                value={reason}
                onChange={(e) => {
                  setReason(e.target.value);
                  setIsReasonPristine(false);
                }}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="mt-1 text-xs text-gray-500">
                Si no tocás este campo, se envía vacío y la API completa con el número de secuencia real.
              </p>
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
        </Card>

        <div>
          <RequestFieldsView
            title="Solicitud MP"
            fetchPreview={() => previewA2(buildCommonPayload())}
            watch={[
              form.payerEmail,
              form.externalReference,
              form.frequency,
              form.frequencyType,
              form.amount,
              form.currency,
              form.startDate,
              form.backUrl,
              form.endDate,
              form.freeTrialFrequency,
              form.freeTrialFrequencyType,
              form.freeTrialFirstInvoiceOffset,
              form.repetitions,
              reason,
              isReasonPristine,
            ]}
          />
        </div>
        </div>
      )}
    </div>
  );
}
