import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ResponsePanel } from "../components/ResponsePanel.js";
import { WebhookList } from "../components/WebhookList.js";
import { TimelineView } from "../components/TimelineView.js";
import { Card } from "../components/Card.js";
import { StatusBadge } from "../components/StatusBadge.js";
import { AdvancedSection } from "../components/AdvancedSection.js";
import { HistorySidebar } from "../components/HistorySidebar.js";
import { Pagination } from "../components/Pagination.js";
import { MasterDetail } from "../components/MasterDetail.js";
import { RequestFieldsView } from "../components/RequestFieldsView.js";
import { SubViewToggle } from "../components/SubViewToggle.js";
import {
  createA1,
  searchA1,
  listA1,
  getA1Detail,
  deleteA1,
  deleteAllA1,
  cancelSubscription,
  previewA1,
} from "../api.js";
import { usePaginatedQuery } from "../hooks/usePaginatedQuery.js";
import { PaymentsDiag } from "../components/PaymentsDiag.js";
import { buildDefaultReason } from "shared";
import type { SubscriptionResponse, SubscriptionDetailResponse } from "shared";

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
// full-page two-column create view (form + live "Solicitud MP" preview).
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


export function A1Pending() {
  const params = useParams<{ id?: string }>();
  const navigate = useNavigate();
  // URL is the source of truth for the selected entity. A null URL param
  // (i.e., we're on /a1) means nothing is selected.
  const selectedId = params.id ?? null;

  // Sub-view is transient UI state, not in the URL. Switches back to
  // "lista" on URL change (see the selectedId-effect below) so a stale
  // create form never appears on top of a different entity's detail.
  const [subView, setSubView] = useState<SubView>("lista");

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
      type: "A.1",
      channel: "checkout_pro",
      paymentMethod: "pending",
      seq: "0001",
    }),
  );
  const [isReasonPristine, setIsReasonPristine] = useState(true);

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
      return listA1({ page: p.page, limit: p.limit });
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
      const d = await getA1Detail(id);
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
      await deleteA1(id);
      setRefetchToken((n) => n + 1);
      if (selectedId === id) {
        navigate("/a1");
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
      await deleteAllA1();
      setRefetchToken((n) => n + 1);
      navigate("/a1");
      setDetail(null);
      setSearchResult(null);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "No se pudo eliminar");
    } finally {
      setDeletingAll(false);
    }
  }

  function selectSubscription(id: string) {
    // H2: removed early-return so re-clicking always refetches the detail
    navigate(`/a1/${encodeURIComponent(id)}`);
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  // Shared by both the real submit (createA1) AND the "Solicitud MP"
  // live preview (previewA1) — same field mapping, so the preview always
  // reflects exactly what a real submit would send.
  function buildPayload(): Parameters<typeof createA1>[0] {
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

    const payload: Parameters<typeof createA1>[0] = {
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
    setSubmitting(true);
    try {
      const payload = buildPayload();
      const result = await createA1(payload);
      setCreateResult(result);
      setRefetchToken((n) => n + 1);
      // Switch back to "Lista", then auto-navigate to the new subscription.
      // The switch happens BEFORE navigate so the URL change triggers the
      // auto-switch effect's no-op (already on "lista").
      setSubView("lista");
      navigate(`/a1/${encodeURIComponent(result.id)}`);
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
      const result = await searchA1(targetId);
      setSearchResult(result);
      // Refresh timeline after search (creates a new snapshot)
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
  const initPoint =
    createResult?.initPoint ??
    (createResult?.rawCreate != null &&
    typeof createResult.rawCreate === "object" &&
    "init_point" in (createResult.rawCreate as object)
      ? ((createResult.rawCreate as Record<string, unknown>).init_point as string)
      : null);
  // Show the init_point banner in the detail column for the sub the user
  // just created (switched back to "Lista" → URL :id set → this banner appears).
  const showInitPoint =
    createResult != null && selectedId === createResult.id && initPoint != null;

  return (
    <div>
      <div className="mb-4">
        <h2 className="text-xl font-semibold text-gray-900 mb-1">A.1 — Preapproval Pending</h2>
        <p className="text-sm text-gray-500">
          Creates a preapproval with{" "}
          <code className="text-xs bg-gray-100 px-1 rounded">status: pending</code>.
          MP returns an <code className="text-xs bg-gray-100 px-1 rounded">init_point</code> the payer uses to authorize.
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
                    <span className="text-gray-400">
                      {new Date(sub.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                </>
              )}
            />
          }
          detail={
            <>
              {/* Checkout ready banner — only for the sub the user just
                  created in this session. The view switches back to "Lista"
                  on submit success, so this is where the init_point link
                  surfaces. */}
              {showInitPoint && (
                <Card title="Checkout listo">
                  <p className="text-xs text-gray-500 mb-2">
                    El pagador debe abrir el siguiente enlace para autorizar la suscripción.
                  </p>
                  <a
                    href={initPoint ?? "#"}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-green-700 underline break-all hover:text-green-900"
                  >
                    Open MP checkout (init_point)
                  </a>
                </Card>
              )}

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

              {/* Webhook card — hidden when no :id is selected. The "method-level
                  feed including unattributed events" copy is gone: on A.1
                  webhooks are only meaningful per-subscription. */}
              {selectedId && (
                <Card title="Webhook Events (live feed)">
                  <p className="text-xs text-gray-500 mb-3">
                    Live feed for subscription {selectedId.slice(0, 8)}…
                  </p>
                  <WebhookList method="a1_pending" subscriptionId={selectedId} />
                </Card>
              )}
            </>
          }
          fab={null}
        />
      )}

      {/* "Crear" — full-page two-column create view. Left column is the
          create form (unchanged fields); right column is the live
          "Solicitud MP" request-construction panel, fed by the SAME
          `buildPayload()`/`watch` wiring the real submit uses, so the
          preview always reflects exactly what a real submit would send.
          Replaces the old cramped create Drawer. */}
      {subView === "crear" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <form onSubmit={handleSubmit} className="space-y-4">
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
              External reference{" "}
              <span className="text-gray-400 font-normal">(optional)</span>
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
            disabled={submitting}
            className="w-full bg-blue-600 text-white rounded px-4 py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {submitting ? "Creating…" : "Create preapproval"}
          </button>
        </form>

        <div>
          <RequestFieldsView
            title="Solicitud MP"
            fetchPreview={() => previewA1(buildPayload())}
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
