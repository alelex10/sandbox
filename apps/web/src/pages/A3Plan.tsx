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
import { SubViewToggle } from "../components/SubViewToggle.js";
import { HistorySidebar } from "../components/HistorySidebar.js";
import { Pagination } from "../components/Pagination.js";
import { MasterDetail } from "../components/MasterDetail.js";
import { EditPlanDrawer } from "../components/EditPlanDrawer.js";
import { RequestFieldsView } from "../components/RequestFieldsView.js";
import {
  createPlan,
  listA3Plans,
  getPlanDetail,
  searchPlan,
  subscribeToPlan,
  listA3,
  searchA3,
  getA3Detail,
  deletePlan,
  deleteA3,
  deleteAllPlans,
  deleteAllA3,
  cancelSubscription,
  previewA3Plan,
  previewA3Subscribe,
} from "../api.js";
import type {
  PlanResponse,
  SubscribeResult,
} from "../api.js";
import type {
  SubscriptionResponse,
  SubscriptionDetailResponse,
  PlanDetailResponse,
  Tokenization,
} from "shared";
import { MP_PUBLIC_KEY as PUBLIC_KEY } from "../config.js";
import { PaymentsDiag } from "../components/PaymentsDiag.js";
import { buildDefaultReason } from "shared";
import { usePaginatedQuery } from "../hooks/usePaginatedQuery.js";

type SubViewKey = "planes" | "suscripciones" | "crear-plan" | "suscribir";
type TokenizationMode = "mercadopagojs" | "brick";
type SubscribePath = "redirect" | "api";

interface PlanFormState {
  reason: string;
  frequency: string;
  frequencyType: "months" | "days";
  amount: string;
  currency: string;
  billingDay: string;
  billingDayProportional: boolean;
  // Advanced
  backUrl: string;
  endDate: string;
  freeTrialFrequency: string;
  freeTrialFrequencyType: "months" | "days";
  freeTrialFirstInvoiceOffset: string;
  repetitions: string;
  paymentTypesAllowed: string[];
  paymentMethodsAllowed: string[];
}

// ---------------------------------------------------------------------------
// Plan picker (used in the subscribe form)
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
        No plans created yet — use the Planes tab to create one first.
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
            {p.reason ?? "Unnamed plan"} — {p.amount} {p.currency} / {p.frequency}{" "}
            {p.frequencyType} ({p.mpPlanId})
          </option>
        ))}
        {plans
          .filter((p) => !p.mpPlanId)
          .map((p) => (
            <option key={p.id} value="" disabled>
              {p.reason ?? "Unnamed plan"} (no mpPlanId — not selectable)
            </option>
          ))}
      </select>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Plans sub-view (master-detail) — URL-driven via /a3/plans/:planId
// ---------------------------------------------------------------------------

interface PlanesViewProps {
  /** Which A3Plan-level tab is currently selected. PlanesView stays mounted
   *  regardless of this value (see A3Plan's render) so its own "Crear plan"
   *  full-page view (gated on `activeSubView === "crear-plan"`) keeps its
   *  own local form state even while a sibling tab is active. */
  activeSubView: SubViewKey;
  plans: PlanResponse[];
  onPlansRefresh: () => void;
  page: number;
  totalPages: number;
  total: number;
  limit: number;
  onPageChange: (p: number) => void;
  /** Called right before navigating to the newly-created plan, so the
   *  outer A3Plan switches its sub-nav back to "Planes" — mirrors
   *  A1Pending's/A2Authorized's "switch to Lista, then navigate" pattern. */
  onSwitchToMain: () => void;
}

function PlanesView({
  activeSubView,
  plans,
  onPlansRefresh,
  page,
  totalPages,
  total,
  limit,
  onPageChange,
  onSwitchToMain,
}: PlanesViewProps) {
  // "planes" -> show the master-detail UI. "crear-plan" -> show the
  // full-page create view below. Otherwise ("suscripciones"/"suscribir")
  // -> show nothing here.
  const showMain = activeSubView === "planes";
  const showCreate = activeSubView === "crear-plan";
  const params = useParams<{ planId?: string }>();
  const navigate = useNavigate();
  // URL is the source of truth.
  const selectedPlanId = params.planId ?? null;

  const [planDetail, setPlanDetail] = useState<PlanDetailResponse | null>(null);
  const [planDetailLoading, setPlanDetailLoading] = useState(false);
  const [deletingAll, setDeletingAll] = useState(false);
  // Edit drawer is transient UI state. Not in the URL. Closes on URL change
  // (see the selectedPlanId-effect below) so a stale form never appears on
  // a different plan when the user clicks another item in the sidebar.
  // (The create-plan flow is a full-page view gated on `activeSubView`, not
  // a Drawer, so it needs no such local "open" state.)
  const [editDrawerOpen, setEditDrawerOpen] = useState(false);

  // Create plan form
  const [planForm, setPlanForm] = useState<PlanFormState>({
    reason: "",
    frequency: "1",
    frequencyType: "months",
    amount: "",
    currency: "ARS",
    billingDay: "",
    billingDayProportional: false,
    // Advanced
    backUrl: "",
    endDate: "",
    freeTrialFrequency: "",
    freeTrialFrequencyType: "months",
    freeTrialFirstInvoiceOffset: "",
    repetitions: "",
    paymentTypesAllowed: [],
    paymentMethodsAllowed: [],
  });
  const [planSubmitting, setPlanSubmitting] = useState(false);
  const [planError, setPlanError] = useState<Error | null>(null);
  const [planResult, setPlanResult] = useState<PlanResponse | null>(null);

  // Search plan in MP
  const [mpSearchResult, setMpSearchResult] = useState<unknown>(null);
  const [mpSearching, setMpSearching] = useState(false);
  const [mpSearchError, setMpSearchError] = useState<string | null>(null);

  const fetchPlanDetail = useCallback(async (id: string) => {
    setPlanDetailLoading(true);
    setPlanDetail(null);
    try {
      const d = await getPlanDetail(id);
      setPlanDetail(d);
    } catch {
      // non-critical
    } finally {
      setPlanDetailLoading(false);
    }
  }, []);

  // Auto-refetch detail when the URL :planId changes
  useEffect(() => {
    if (selectedPlanId) {
      void fetchPlanDetail(selectedPlanId);
      setMpSearchResult(null);
      setMpSearchError(null);
    } else {
      setPlanDetail(null);
      setMpSearchResult(null);
      setMpSearchError(null);
    }
  }, [selectedPlanId, fetchPlanDetail]);

  // Auto-close the edit drawer on URL change. Stops a stale form from
  // appearing on a different plan when the user clicks another item in the
  // sidebar. (Spec: "drawer auto-closes on URL change".)
  useEffect(() => {
    setEditDrawerOpen(false);
  }, [selectedPlanId]);

  async function handleDeletePlan(id: string) {
    if (!window.confirm("¿Eliminar este registro del historial? (borrado lógico, los datos se conservan)")) return;
    try {
      await deletePlan(id);
      onPlansRefresh();
      if (selectedPlanId === id) {
        navigate("/a3/plans");
        setPlanDetail(null);
        setMpSearchResult(null);
        setMpSearchError(null);
        setPlanResult(null);
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
      await deleteAllPlans();
      onPlansRefresh();
      navigate("/a3/plans");
      setPlanDetail(null);
      setMpSearchResult(null);
      setMpSearchError(null);
      setPlanResult(null);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "No se pudo eliminar");
    } finally {
      setDeletingAll(false);
    }
  }

  function selectPlan(id: string) {
    navigate(`/a3/plans/${encodeURIComponent(id)}`);
  }

  // Shared by both the real submit (createPlan) AND the "Solicitud MP" live
  // preview (previewA3Plan) — same field mapping, so the preview always
  // reflects exactly what a real submit would send. Mirrors A1Pending's/
  // A2Authorized's `buildPayload()` pattern.
  function buildPlanPayload(): Parameters<typeof createPlan>[0] {
    const freeTrial =
      planForm.freeTrialFrequency
        ? {
            frequency: Number(planForm.freeTrialFrequency),
            frequencyType: planForm.freeTrialFrequencyType,
            ...(planForm.freeTrialFirstInvoiceOffset
              ? { firstInvoiceOffset: Number(planForm.freeTrialFirstInvoiceOffset) }
              : {}),
          }
        : undefined;

    const payload: Parameters<typeof createPlan>[0] = {
      reason: planForm.reason,
      autoRecurring: {
        frequency: Number(planForm.frequency),
        frequencyType: planForm.frequencyType,
        amount: Number(planForm.amount),
        currency: planForm.currency,
        ...(planForm.endDate ? { endDate: new Date(planForm.endDate).toISOString() } : {}),
        ...(freeTrial ? { freeTrial } : {}),
        ...(planForm.repetitions ? { repetitions: Number(planForm.repetitions) } : {}),
      },
    };
    if (planForm.billingDay) {
      payload.billingDay = Number(planForm.billingDay);
      payload.billingDayProportional = planForm.billingDayProportional;
    }
    if (planForm.backUrl) payload.backUrl = planForm.backUrl;
    const paymentTypes = planForm.paymentTypesAllowed;
    const paymentMethods = planForm.paymentMethodsAllowed;
    if (paymentTypes.length > 0 || paymentMethods.length > 0) {
      payload.paymentMethodsAllowed = {
        ...(paymentTypes.length > 0 ? { paymentTypes } : {}),
        ...(paymentMethods.length > 0 ? { paymentMethods } : {}),
      };
    }
    return payload;
  }

  async function handleCreatePlan(e: React.FormEvent) {
    e.preventDefault();
    setPlanError(null);
    setPlanSubmitting(true);
    try {
      const payload = buildPlanPayload();
      const created = await createPlan(payload);
      setPlanResult(created);
      onPlansRefresh();
      // Switch back to "Planes", then auto-navigate to the newly created
      // plan. The switch happens BEFORE navigate, mirroring A1Pending's/
      // A2Authorized's "switch to Lista, then navigate" ordering.
      onSwitchToMain();
      navigate(`/a3/plans/${encodeURIComponent(created.id)}`);
    } catch (err) {
      setPlanError(err instanceof Error ? err : new Error("Request failed"));
    } finally {
      setPlanSubmitting(false);
    }
  }

  async function handleSearchPlan() {
    if (!selectedPlanId) return;
    setMpSearchError(null);
    setMpSearchResult(null);
    setMpSearching(true);
    try {
      const result = await searchPlan(selectedPlanId);
      setMpSearchResult(result);
      // Refresh timeline after MP fetch
      void fetchPlanDetail(selectedPlanId);
    } catch (err) {
      setMpSearchError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setMpSearching(false);
    }
  }

  const selectedPlan = plans.find((p) => p.id === selectedPlanId);

  return (
    <>
    {showMain && (
    <MasterDetail
      sidebar={
        <HistorySidebar
          title="Planes guardados"
          items={plans}
          selectedId={selectedPlanId}
          onSelect={selectPlan}
          getId={(p) => p.id}
          onDelete={handleDeletePlan}
          onClearAll={handleClearAll}
          footer={
            <Pagination
              page={page}
              totalPages={totalPages}
              total={total}
              limit={limit}
              onPageChange={onPageChange}
            />
          }
          renderItem={(p) => (
            <>
              <div className="font-mono text-gray-700 truncate">{p.id.slice(0, 16)}…</div>
              <div className="text-gray-600 truncate mt-0.5">{p.reason ?? "—"}</div>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-gray-500 font-medium">
                  {p.amount} {p.currency}
                </span>
                <span className="text-gray-400">
                  / {p.frequency} {p.frequencyType}
                </span>
              </div>
              <div className="text-gray-400 mt-0.5">
                {new Date(p.createdAt).toLocaleDateString()}
              </div>
            </>
          )}
        />
      }
      detail={
        <>
          {/* Plan init_point banner — only for the plan the user just
              created in this session. Drawer closes on submit success,
              so this is where the init_point link surfaces. */}
          {planResult && planResult.id === selectedPlanId && planResult.initPoint && (
            <Card title="Plan init_point (public checkout link)">
              <p className="text-xs text-gray-500 mb-2">
                El pagador debe abrir el siguiente enlace para suscribirse al plan.
              </p>
              <a
                href={planResult.initPoint}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-blue-600 underline break-all hover:text-blue-800"
              >
                {planResult.initPoint}
              </a>
            </Card>
          )}

          {/* Search plan in MP */}
          <Card title="Buscar plan en MP (GET)">
            <div className="space-y-3">
              <p className="text-xs text-gray-500">
                Fetches the selected plan from MP via{" "}
                <code className="bg-gray-100 px-1 rounded">GET /a3/plans/:id/mp</code> and
                appends a snapshot to its timeline.
              </p>
              {!selectedPlanId && (
                <p className="text-sm text-gray-400 italic">
                  Select a plan from the sidebar first.
                </p>
              )}
              {selectedPlanId && (
                <>
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-mono text-gray-600 truncate">
                      {selectedPlanId}
                    </span>
                    <button
                      type="button"
                      onClick={handleSearchPlan}
                      disabled={mpSearching}
                      className="shrink-0 bg-gray-700 text-white rounded px-4 py-2 text-sm font-medium hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {mpSearching ? "Searching…" : "Buscar en MP"}
                    </button>
                  </div>
                  {mpSearchError && (
                    <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
                      {mpSearchError}
                    </p>
                  )}
                  {mpSearchResult !== null && <ResponsePanel data={mpSearchResult} />}
                </>
              )}
            </div>
          </Card>

          {/* Timeline del plan */}
          <Card title="Timeline del plan">
            {selectedPlan ? (
              <div>
                <div className="flex items-center gap-2 mb-4 pb-2 border-b border-gray-100">
                  <span className="text-xs text-gray-500 font-mono truncate">
                    {selectedPlan.id}
                  </span>
                  {selectedPlan.mpPlanId && (
                    <span className="text-xs text-gray-400 font-mono truncate">
                      MP: {selectedPlan.mpPlanId}
                    </span>
                  )}
                  <div className="ml-auto flex items-center gap-2 shrink-0">
                    {selectedPlan?.mpPlanId && (
                      <button
                        type="button"
                        onClick={() => setEditDrawerOpen(true)}
                        className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                        title="Editar plan en MP"
                      >
                        Editar plan
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        if (selectedPlanId) void fetchPlanDetail(selectedPlanId);
                      }}
                      disabled={planDetailLoading}
                      className="text-xs text-gray-500 hover:text-gray-700 disabled:opacity-50"
                      title="Refetch timeline"
                    >
                      {planDetailLoading ? "..." : "↻ Actualizar"}
                    </button>
                  </div>
                </div>
                <TimelineView
                  entries={planDetail?.timeline ?? []}
                  loading={planDetailLoading}
                />
              </div>
            ) : (
              <p className="text-sm text-gray-400 italic">
                Select a plan from the sidebar to view its details and webhooks.
              </p>
            )}
          </Card>

          {/* Webhook card — hidden when no :planId is selected. The "method-level
              feed including unattributed events" copy is gone: on A.3 plans
              webhooks are only meaningful per-plan. */}
          {selectedPlanId && (
            <Card title="Webhook Events (live feed)">
              <p className="text-xs text-gray-500 mb-3">
                Live feed for all subscriptions of this plan.
              </p>
              <WebhookList method="a3_plan" planId={selectedPlanId} />
            </Card>
          )}
        </>
      }
      fab={null}
    />
    )}

    {/* "Crear plan" — full-page two-column create view (replaces the old
        cramped create Drawer). Left column is the plan-create form
        (unchanged fields, no tokenization needed); right column is the
        live "Solicitud MP — Crear plan" request-construction panel, fed
        by the SAME `buildPlanPayload()`/`watch` wiring the real submit
        uses. */}
    {/* Edit plan drawer — only renders when a plan with mpPlanId is selected */}
    {selectedPlan && (
      <EditPlanDrawer
        open={editDrawerOpen}
        onClose={() => setEditDrawerOpen(false)}
        plan={selectedPlan}
        prefillSource={planDetail?.rawLastSearch ?? planDetail?.rawCreate ?? null}
        onUpdated={(updated) => {
          setPlanResult(updated);
          void fetchPlanDetail(selectedPlanId!);
          onPlansRefresh();
        }}
      />
    )}

    {showCreate && (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
      <form onSubmit={handleCreatePlan} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Reason</label>
          <input
            type="text"
            value={planForm.reason}
            onChange={(e) => setPlanForm((prev) => ({ ...prev, reason: e.target.value }))}
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
                value={planForm.frequency}
                onChange={(e) =>
                  setPlanForm((prev) => ({ ...prev, frequency: e.target.value }))
                }
                min="1"
                required
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
              <select
                value={planForm.frequencyType}
                onChange={(e) =>
                  setPlanForm((prev) => ({
                    ...prev,
                    frequencyType: e.target.value as "months" | "days",
                  }))
                }
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
                onChange={(e) =>
                  setPlanForm((prev) => ({ ...prev, amount: e.target.value }))
                }
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
                value={planForm.currency}
                onChange={(e) =>
                  setPlanForm((prev) => ({ ...prev, currency: e.target.value }))
                }
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
              <span className="text-gray-400 font-normal">(optional, 1–28)</span>
            </label>
            <input
              type="number"
              value={planForm.billingDay}
              onChange={(e) =>
                setPlanForm((prev) => ({ ...prev, billingDay: e.target.value }))
              }
              min="1"
              max="28"
              placeholder="Leave empty for default"
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <label className="flex items-start gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={planForm.billingDayProportional}
              onChange={(e) =>
                setPlanForm((prev) => ({
                  ...prev,
                  billingDayProportional: e.target.checked,
                }))
              }
              className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span>
              Cobro proporcional{" "}
              <span className="text-gray-400 font-normal">
                (billing_day_proportional — cobra proporcional el período
                parcial hasta el billing day; solo aplica a planes mensuales
                con billing day)
              </span>
            </span>
          </label>
        </fieldset>
        <AdvancedSection>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Back URL <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <input
              type="url"
              value={planForm.backUrl}
              onChange={(e) => setPlanForm((prev) => ({ ...prev, backUrl: e.target.value }))}
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
              value={planForm.endDate}
              onChange={(e) => setPlanForm((prev) => ({ ...prev, endDate: e.target.value }))}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Repetitions <span className="text-gray-400 font-normal">(autoRecurring.repetitions, optional)</span>
            </label>
            <input
              type="number"
              value={planForm.repetitions}
              onChange={(e) => setPlanForm((prev) => ({ ...prev, repetitions: e.target.value }))}
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
                  value={planForm.freeTrialFrequency}
                  onChange={(e) => setPlanForm((prev) => ({ ...prev, freeTrialFrequency: e.target.value }))}
                  min="1"
                  placeholder="e.g. 1"
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="flex-1">
                <label className="block text-xs font-medium text-gray-700 mb-1">Type</label>
                <select
                  value={planForm.freeTrialFrequencyType}
                  onChange={(e) => setPlanForm((prev) => ({ ...prev, freeTrialFrequencyType: e.target.value as "months" | "days" }))}
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
                  value={planForm.freeTrialFirstInvoiceOffset}
                  onChange={(e) => setPlanForm((prev) => ({ ...prev, freeTrialFirstInvoiceOffset: e.target.value }))}
                  min="0"
                  placeholder="e.g. 0"
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </fieldset>
          <div>
            <p className="text-xs font-medium text-gray-700 mb-2">Payment types allowed</p>
            <div className="flex flex-wrap gap-3">
              {(["credit_card", "debit_card", "ticket", "bank_transfer"] as const).map((pt) => (
                <label key={pt} className="flex items-center gap-1.5 text-xs text-gray-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={planForm.paymentTypesAllowed.includes(pt)}
                    onChange={(e) =>
                      setPlanForm((prev) => ({
                        ...prev,
                        paymentTypesAllowed: e.target.checked
                          ? [...prev.paymentTypesAllowed, pt]
                          : prev.paymentTypesAllowed.filter((x) => x !== pt),
                      }))
                    }
                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  {pt}
                </label>
              ))}
            </div>
          </div>
          <div>
            <p className="text-xs font-medium text-gray-700 mb-2">Payment methods allowed</p>
            <div className="flex flex-wrap gap-3">
              {(["visa", "master", "amex", "naranja", "cabal"] as const).map((pm) => (
                <label key={pm} className="flex items-center gap-1.5 text-xs text-gray-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={planForm.paymentMethodsAllowed.includes(pm)}
                    onChange={(e) =>
                      setPlanForm((prev) => ({
                        ...prev,
                        paymentMethodsAllowed: e.target.checked
                          ? [...prev.paymentMethodsAllowed, pm]
                          : prev.paymentMethodsAllowed.filter((x) => x !== pm),
                      }))
                    }
                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  {pm}
                </label>
              ))}
            </div>
          </div>
        </AdvancedSection>
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

      <div>
        <RequestFieldsView
          title="Solicitud MP — Crear plan"
          fetchPreview={() => previewA3Plan(buildPlanPayload())}
          watch={[
            planForm.reason,
            planForm.frequency,
            planForm.frequencyType,
            planForm.amount,
            planForm.currency,
            planForm.billingDay,
            planForm.billingDayProportional,
            planForm.backUrl,
            planForm.endDate,
            planForm.freeTrialFrequency,
            planForm.freeTrialFrequencyType,
            planForm.freeTrialFirstInvoiceOffset,
            planForm.repetitions,
            planForm.paymentTypesAllowed,
            planForm.paymentMethodsAllowed,
          ]}
        />
      </div>
      </div>
    )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Suscripciones sub-view — URL-driven via /a3/subs/:subId
// ---------------------------------------------------------------------------

interface SuscripcionesViewProps {
  /** Which A3Plan-level tab is currently selected. SuscripcionesView stays
   *  mounted regardless of this value (see A3Plan's render) so its own
   *  "Suscribir a plan" full-page view (gated on
   *  `activeSubView === "suscribir"`) keeps its own local form state even
   *  while a sibling tab is active. */
  activeSubView: SubViewKey;
  plans: PlanResponse[];
  subscriptions: SubscriptionResponse[];
  onSubscriptionsRefresh: () => void;
  page: number;
  totalPages: number;
  total: number;
  limit: number;
  onPageChange: (p: number) => void;
  /** Called right before navigating to the newly-created subscription, so
   *  the outer A3Plan switches its sub-nav back to "Suscripciones" —
   *  mirrors A1Pending's/A2Authorized's "switch to Lista, then navigate"
   *  pattern. */
  onSwitchToMain: () => void;
}

function SuscripcionesView({
  activeSubView,
  plans,
  subscriptions,
  onSubscriptionsRefresh,
  page,
  totalPages,
  total,
  limit,
  onPageChange,
  onSwitchToMain,
}: SuscripcionesViewProps) {
  // "suscripciones" -> show the master-detail UI. "suscribir" -> show the
  // full-page create view below. Otherwise ("planes"/"crear-plan") -> show
  // nothing here.
  const showMain = activeSubView === "suscripciones";
  const showCreate = activeSubView === "suscribir";
  const params = useParams<{ subId?: string }>();
  const navigate = useNavigate();
  const selectedId = params.subId ?? null;

  const [detail, setDetail] = useState<SubscriptionDetailResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [deletingAll, setDeletingAll] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  // (The create-subscription flow is a full-page view gated on
  // `activeSubView`, not a Drawer, so it needs no local "open" state.)

  // Cancel-menu state (Timeline header `…` overflow). Same outside-click
  // close pattern as the HistorySidebar's `…` menu and the A.2 PR2a pattern.
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

  // Typed-confirm state for "Cancelar en MP". Spec: user must type the
  // literal string `CANCELAR` exactly before the cancel request fires.
  // We use a small inline native <dialog> (rendered conditionally) so we
  // have full control over the input + confirm button — `window.prompt`
  // can't enforce "button must be disabled until the input matches".
  const [typedConfirmOpen, setTypedConfirmOpen] = useState(false);
  const [typedConfirmValue, setTypedConfirmValue] = useState("");
  const typedConfirmRef = useRef<HTMLDialogElement | null>(null);
  // Open / close the typed-confirm <dialog> in sync with `typedConfirmOpen`.
  useEffect(() => {
    const dialog = typedConfirmRef.current;
    if (!dialog) return;
    if (typedConfirmOpen) {
      if (!dialog.open) dialog.showModal();
    } else {
      if (dialog.open) dialog.close();
    }
  }, [typedConfirmOpen]);

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
  // Advanced subscribe fields — top-level
  const [subBackUrl, setSubBackUrl] = useState("");
  // T6 — visual pre-fill: subReason is initialized with the computed default
  // for the current branch (api + tokenized, or redirect). The form tracks
  // pristine state; if the user doesn't touch the field, submit sends empty
  // so the API fills in the real seq.
  const [subReason, setSubReason] = useState(() =>
    buildDefaultReason({
      type: "A.3",
      channel: cardTokenId !== null ? "tokenizacion" : "checkout_pro",
      tokenization: cardTokenId !== null ? tokenizationMode : undefined,
      paymentMethod: cardTokenId !== null ? "card" : "pending",
      seq: "0001",
    }),
  );
  const [isSubReasonPristine, setIsSubReasonPristine] = useState(true);

  // Keep the pre-filled subReason in sync with the current branch (api vs
  // redirect) and the tokenizationMode. The user owns the field once they
  // touch it — `isSubReasonPristine` flips false in the input's onChange.
  useEffect(() => {
    if (isSubReasonPristine) {
      const hasCardToken = cardTokenId !== null;
      setSubReason(
        buildDefaultReason({
          type: "A.3",
          channel: hasCardToken ? "tokenizacion" : "checkout_pro",
          tokenization: hasCardToken ? tokenizationMode : undefined,
          paymentMethod: hasCardToken ? "card" : "pending",
          seq: "0001",
        }),
      );
    }
  }, [cardTokenId, tokenizationMode, isSubReasonPristine]);
  // auto_recurring override (empirical probe — any subset; empty fields are omitted)
  const [orAmount, setOrAmount] = useState("");
  const [orFrequency, setOrFrequency] = useState("");
  const [orFrequencyType, setOrFrequencyType] = useState("");
  const [orCurrency, setOrCurrency] = useState("");
  const [orStartDate, setOrStartDate] = useState("");
  const [orEndDate, setOrEndDate] = useState("");
  const [orBillingDay, setOrBillingDay] = useState("");
  const [orFtFrequency, setOrFtFrequency] = useState("");
  const [orFtFrequencyType, setOrFtFrequencyType] = useState("months");
  const [orFtFirstInvoiceOffset, setOrFtFirstInvoiceOffset] = useState("");

  // Search
  const [searchMpId, setSearchMpId] = useState("");
  const [searchResult, setSearchResult] = useState<unknown>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchIsInfo, setSearchIsInfo] = useState(false);

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

  async function handleDeleteSub(id: string) {
    if (!window.confirm("¿Eliminar este registro del historial? (borrado lógico, los datos se conservan)")) return;
    try {
      await deleteA3(id);
      onSubscriptionsRefresh();
      if (selectedId === id) {
        navigate("/a3/subs");
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
      await deleteAllA3();
      onSubscriptionsRefresh();
      navigate("/a3/subs");
      setDetail(null);
      setSearchResult(null);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "No se pudo eliminar");
    } finally {
      setDeletingAll(false);
    }
  }

  function selectSubscription(id: string) {
    navigate(`/a3/subs/${encodeURIComponent(id)}`);
  }

  // Shared by both the real submit (subscribeToPlan) AND the "Solicitud MP"
  // live preview (previewA3Subscribe) — same field mapping, so the preview
  // always reflects exactly what a real submit would send. Mirrors
  // A1Pending's/A2Authorized's `buildPayload()` pattern. Does NOT enforce
  // the submit-time guards (plan selected / card tokenized) — like A1/A2's
  // preview, it always builds a best-effort payload and lets the server's
  // preview-defaults fill in whatever is still missing.
  function buildSubscribePayload(): Parameters<typeof subscribeToPlan>[0] {
    const payload: Parameters<typeof subscribeToPlan>[0] = {
      preapprovalPlanId: selectedPlanMpId,
      payerEmail,
      externalReference: externalReference || crypto.randomUUID(),
    };
    if (subscribePath === "api" && cardTokenId && tokenSource) {
      payload.cardTokenId = cardTokenId;
      payload.tokenization = tokenSource;
    }
    if (subBackUrl) payload.backUrl = subBackUrl;
    // T6 — visual pre-fill: if the user hasn't touched the field, send
    // empty so the API fills in the real seq. If they have, send their
    // value verbatim (including empty if they cleared it).
    payload.reason = isSubReasonPristine ? "" : subReason;
    // Build auto_recurring override — only include fields the user filled; omit empties.
    // Only applies on the API path; redirect path does not send autoRecurring.
    if (subscribePath === "api") {
      type AROverride = NonNullable<typeof payload.autoRecurring>;
      const ar: AROverride = {};
      if (orAmount) ar.amount = Number(orAmount);
      if (orFrequency) ar.frequency = Number(orFrequency);
      if (orFrequencyType === "months" || orFrequencyType === "days") {
        ar.frequencyType = orFrequencyType;
      }
      if (orCurrency && orCurrency.length === 3) ar.currency = orCurrency.toUpperCase();
      if (orStartDate) ar.startDate = new Date(orStartDate).toISOString();
      if (orEndDate) ar.endDate = new Date(orEndDate).toISOString();
      if (orBillingDay) ar.billingDay = Number(orBillingDay);
      if (orFtFrequency) {
        ar.freeTrial = {
          frequency: Number(orFtFrequency),
          frequencyType: orFtFrequencyType === "days" ? "days" : "months",
          ...(orFtFirstInvoiceOffset !== ""
            ? { firstInvoiceOffset: Number(orFtFirstInvoiceOffset) }
            : {}),
        };
      }
      if (Object.keys(ar).length > 0) payload.autoRecurring = ar;
    }
    return payload;
  }

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
      const payload = buildSubscribePayload();
      const res = await subscribeToPlan(payload);
      setSubResult(res);
      // Reset token state explicitly so the create view starts fresh
      // next time.
      setCardTokenId(null);
      setTokenSource(null);
      onSubscriptionsRefresh();
      // Switch back to "Suscripciones", then auto-navigate to the newly
      // created subscription. The switch happens BEFORE navigate,
      // mirroring A1Pending's/A2Authorized's/PlanesView's ordering.
      onSwitchToMain();
      navigate(`/a3/subs/${encodeURIComponent(res.id)}`);
    } catch (err) {
      setSubError(err instanceof Error ? err : new Error("Request failed"));
    } finally {
      setSubSubmitting(false);
    }
  }

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

  async function handleCancel() {
    if (!selectedId) return;
    // Open the typed-confirm dialog. The actual cancel request is fired
    // from the dialog's Confirm button (see handleTypedConfirmCancel) only
    // after the user types `CANCELAR` exactly. This replaces the old
    // `window.confirm` flow per the spec's "typed confirmation" decision.
    setTypedConfirmValue("");
    setTypedConfirmOpen(true);
  }

  async function handleTypedConfirmCancel() {
    // Strict equality, case-sensitive. Any deviation (empty, lowercase,
    // extra whitespace) blocks the request.
    if (typedConfirmValue !== "CANCELAR") return;
    if (!selectedId) return;
    setTypedConfirmOpen(false);
    setTypedConfirmValue("");
    setCancelling(true);
    try {
      await cancelSubscription(selectedId);
      onSubscriptionsRefresh();
      void fetchDetail(selectedId);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "No se pudo cancelar");
    } finally {
      setCancelling(false);
    }
  }

  const selectedSub = subscriptions.find((s) => s.id === selectedId);

  return (
    <>
    {showMain && (
    <MasterDetail
      sidebar={
        <HistorySidebar
          title="Suscripciones"
          items={subscriptions}
          selectedId={selectedId}
          onSelect={selectSubscription}
          getId={(s) => s.id}
          onDelete={handleDeleteSub}
          onClearAll={handleClearAll}
          footer={
            <Pagination
              page={page}
              totalPages={totalPages}
              total={total}
              limit={limit}
              onPageChange={onPageChange}
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
          {/* Search card */}
          <Card title="Buscar por ID (GET subscription)">
            <div className="space-y-3">
              <p className="text-xs text-gray-500">
                Triggers{" "}
                <code className="bg-gray-100 px-1 rounded">GET /:id/mp</code> and appends a new
                snapshot.
              </p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={searchMpId}
                  onChange={(e) => setSearchMpId(e.target.value)}
                  placeholder={
                    selectedId
                      ? `${selectedId.slice(0, 20)}… (selected)`
                      : "Local subscription ID"
                  }
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

          {/* Timeline card with `…` overflow menu (Cancel moved off the header
              and now requires typed confirmation, per the spec). Pattern
              matches the A.2 PR2a `…` menu and the HistorySidebar's `…` menu. */}
          <Card title="Timeline">
            {selectedSub ? (
              <div>
                <div className="flex items-center gap-2 mb-4 pb-2 border-b border-gray-100">
                  <span className="text-xs text-gray-500 font-mono">{selectedSub.id}</span>
                  <StatusBadge status={selectedSub.status} />
                  <button
                    type="button"
                    onClick={() => {
                      if (selectedId) void fetchDetail(selectedId);
                    }}
                    disabled={detailLoading}
                    className="ml-auto text-xs text-gray-500 hover:text-gray-700 disabled:opacity-50"
                    title="Refetch timeline"
                  >
                    {detailLoading ? "..." : "↻ Actualizar"}
                  </button>
                  {/* `…` overflow menu — destructive "Cancelar en MP" lives here,
                      off the header row. The menu item opens a typed-confirm
                      dialog (see below) where the user must type `CANCELAR`
                      exactly before the cancel request fires. */}
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
                            title="Cancelar en MercadoPago (irreversible — requiere tipear CANCELAR)"
                          >
                            {cancelling ? "Cancelando…" : "Cancelar en MP"}
                          </button>
                        </div>
                      )}
                    </div>
                  )}
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
                <TimelineView entries={detail?.timeline ?? []} loading={detailLoading} />
              </div>
            ) : (
              <p className="text-sm text-gray-400 italic">
                Select a subscription from the sidebar to view its details, payments and webhooks.
              </p>
            )}
          </Card>

          {/* Payments diagnostic card — only shown when a subscription is selected */}
          {selectedId && <PaymentsDiag subscriptionId={selectedId} />}

          {/* Webhook card — hidden when no :subId is selected. The "method-level
              feed including unattributed events" copy is gone: on A.3 subs
              webhooks are only meaningful per-subscription. Matches the
              A.1 PR1 / A.2 PR2a / B PR2b / A.3 PlanesView PR3a pattern. */}
          {selectedId && (
            <Card title="Webhook Events (live feed)">
              <p className="text-xs text-gray-500 mb-3">
                Live feed for subscription {selectedId.slice(0, 8)}…
              </p>
              <WebhookList method="a3_plan" subscriptionId={selectedId} />
            </Card>
          )}
        </>
      }
      fab={null}
    />
    )}

    {/* "Suscribir a plan" — full-page two-column create view (replaces the
        old cramped subscribe Drawer). Left column has the tokenization
        step (API path) + the subscribe form; right column is the live
        "Solicitud MP — Suscribir a plan" request-construction panel, fed
        by the SAME `buildSubscribePayload()`/`watch` wiring the real
        submit uses. Unmounting this block when `showCreate` is false
        (same as the old Drawer's "children only render while open"
        contract) still unmounts the CardBrick subtree, and the
        `key={`brick-${tokenizationMode}`}` still forces a clean remount
        next time the view is shown. */}
    {showCreate && (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
      <div className="space-y-4">
      {/* Tokenization — rendered OUTSIDE the subscribe form to avoid nested <form> elements */}
      {subscribePath === "api" && (
        <div className="mb-4">
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
              <CardFormMpJs
                publicKey={PUBLIC_KEY}
                onToken={(id) => {
                  setCardTokenId(id);
                  setTokenSource(tokenizationMode);
                  setSubError(null);
                }}
              />
            ) : (
              <CardBrick
                key={`brick-${tokenizationMode}`}
                publicKey={PUBLIC_KEY}
                onToken={(id) => {
                  setCardTokenId(id);
                  setTokenSource(tokenizationMode);
                  setSubError(null);
                }}
              />
            )}
          </div>
          {cardTokenId && (
            <p className="mt-2 text-xs text-green-700 bg-green-50 border border-green-200 rounded px-3 py-2">
              Card token ready (via{" "}
              <span className="font-mono">{tokenSource}</span>). Submit to create the
              subscription.
            </p>
          )}
        </div>
      )}

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
            External reference{" "}
            <span className="text-gray-400 font-normal">(optional)</span>
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

        {subscribePath === "api" ? (
          <AdvancedSection>
            {/* Top-level fields */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Back URL <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <input
                type="url"
                value={subBackUrl}
                onChange={(e) => setSubBackUrl(e.target.value)}
                placeholder="https://example.com/return"
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Reason <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <input
                type="text"
                value={subReason}
                onChange={(e) => {
                  setSubReason(e.target.value);
                  setIsSubReasonPristine(false);
                }}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="mt-1 text-xs text-gray-500">
                Si no tocás este campo, se envía vacío y la API completa con el número de secuencia real.
              </p>
            </div>

            {/* auto_recurring override probe */}
            <fieldset className="border border-amber-200 bg-amber-50 rounded p-4 space-y-3">
              <legend className="text-xs font-semibold text-amber-700 px-1">
                Override del plan (auto_recurring) — para probar si se superpone al plan
              </legend>
              <p className="text-xs text-amber-600">
                Si lo dejás vacío, se usan los valores del plan.
              </p>
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Amount
                  </label>
                  <input
                    type="number"
                    value={orAmount}
                    onChange={(e) => setOrAmount(e.target.value)}
                    min="0.01"
                    step="0.01"
                    placeholder="e.g. 500"
                    className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Frequency
                  </label>
                  <input
                    type="number"
                    value={orFrequency}
                    onChange={(e) => setOrFrequency(e.target.value)}
                    min="1"
                    placeholder="e.g. 1"
                    className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Freq. type
                  </label>
                  <select
                    value={orFrequencyType}
                    onChange={(e) => setOrFrequencyType(e.target.value)}
                    className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                  >
                    <option value="">— (plan default)</option>
                    <option value="months">months</option>
                    <option value="days">days</option>
                  </select>
                </div>
              </div>
              <div className="flex gap-3">
                <div className="w-28">
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Currency
                  </label>
                  <input
                    type="text"
                    value={orCurrency}
                    onChange={(e) => setOrCurrency(e.target.value)}
                    maxLength={3}
                    placeholder="ARS"
                    className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Billing day{" "}
                    <span className="text-gray-400 font-normal">(1–28)</span>
                  </label>
                  <input
                    type="number"
                    value={orBillingDay}
                    onChange={(e) => setOrBillingDay(e.target.value)}
                    min="1"
                    max="28"
                    placeholder="e.g. 5"
                    className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                  />
                </div>
              </div>
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Start date
                  </label>
                  <input
                    type="datetime-local"
                    value={orStartDate}
                    onChange={(e) => setOrStartDate(e.target.value)}
                    className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    End date
                  </label>
                  <input
                    type="datetime-local"
                    value={orEndDate}
                    onChange={(e) => setOrEndDate(e.target.value)}
                    className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                  />
                </div>
              </div>
              <fieldset className="border border-gray-200 rounded p-3 space-y-2">
                <legend className="text-xs font-medium text-gray-600 px-1">
                  Free trial override{" "}
                  <span className="text-gray-400 font-normal">
                    (fill frequency to enable)
                  </span>
                </legend>
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Frequency
                    </label>
                    <input
                      type="number"
                      value={orFtFrequency}
                      onChange={(e) => setOrFtFrequency(e.target.value)}
                      min="1"
                      placeholder="e.g. 1"
                      className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Type
                    </label>
                    <select
                      value={orFtFrequencyType}
                      onChange={(e) => setOrFtFrequencyType(e.target.value)}
                      className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                    >
                      <option value="months">months</option>
                      <option value="days">days</option>
                    </select>
                  </div>
                  <div className="flex-1">
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      First invoice offset
                    </label>
                    <input
                      type="number"
                      value={orFtFirstInvoiceOffset}
                      onChange={(e) => setOrFtFirstInvoiceOffset(e.target.value)}
                      min="0"
                      placeholder="e.g. 0"
                      className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                    />
                  </div>
                </div>
              </fieldset>
            </fieldset>
          </AdvancedSection>
        ) : (
          <p className="text-xs text-gray-400 italic">
            Advanced overrides (backUrl, reason, auto_recurring) only apply to the API subscription path.
          </p>
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
      </div>

      <div>
        <RequestFieldsView
          title="Solicitud MP — Suscribir a plan"
          fetchPreview={() => previewA3Subscribe(buildSubscribePayload())}
          watch={[
            selectedPlanMpId,
            payerEmail,
            externalReference,
            subscribePath,
            cardTokenId,
            tokenSource,
            subBackUrl,
            subReason,
            isSubReasonPristine,
            orAmount,
            orFrequency,
            orFrequencyType,
            orCurrency,
            orStartDate,
            orEndDate,
            orBillingDay,
            orFtFrequency,
            orFtFrequencyType,
            orFtFirstInvoiceOffset,
          ]}
        />
      </div>
      </div>
    )}

    {/* Typed-confirm dialog for "Cancelar en MP". Spec: the user must type
        the literal string `CANCELAR` exactly before the cancel request
        fires. The Confirm button is disabled until the input matches.
        We use a small native <dialog> (not window.prompt) so we can
        disable the confirm button until the typed value is exact — that
        level of control isn't possible with `window.prompt`. The dialog
        can be dismissed with Esc or the Cancel button, but neither counts
        as a confirmation. */}
    <dialog
      ref={typedConfirmRef}
      onClose={() => {
        setTypedConfirmOpen(false);
        setTypedConfirmValue("");
      }}
      className="bg-transparent p-0 m-0 max-w-none max-h-none w-full h-full backdrop:bg-gray-900/50 open:sm:flex sm:items-center sm:justify-center"
    >
      <div className="bg-white rounded-lg shadow-xl w-full sm:max-w-md sm:mx-4 p-5 space-y-3">
        <h3 className="text-sm font-semibold text-red-700">
          Cancelar suscripción en MercadoPago
        </h3>
        <p className="text-xs text-gray-600">
          Esta acción es <strong>IRREVERSIBLE</strong> y deja de cobrar al pagador.
          Para confirmar, escribí <code className="bg-gray-100 px-1 rounded font-mono">CANCELAR</code>{" "}
          (mayúsculas, sin espacios) en el campo de abajo.
        </p>
        <input
          type="text"
          autoFocus
          value={typedConfirmValue}
          onChange={(e) => setTypedConfirmValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && typedConfirmValue === "CANCELAR") {
              e.preventDefault();
              void handleTypedConfirmCancel();
            }
          }}
          placeholder="CANCELAR"
          className="w-full border border-gray-300 rounded px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-red-500"
        />
        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={() => {
              setTypedConfirmOpen(false);
              setTypedConfirmValue("");
            }}
            className="px-3 py-1.5 text-xs font-medium text-gray-700 border border-gray-300 rounded hover:bg-gray-50 transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void handleTypedConfirmCancel()}
            disabled={typedConfirmValue !== "CANCELAR"}
            className="px-3 py-1.5 text-xs font-medium text-white bg-red-600 rounded hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Confirmar cancelación
          </button>
        </div>
      </div>
    </dialog>
    </>
  );
}

// ---------------------------------------------------------------------------
// A3Plan page — root, URL-driven sub-view via /a3/plans and /a3/subs
// ---------------------------------------------------------------------------

export function A3Plan({ section }: { section?: "plans" | "subs" } = {}) {
  // The router gives us `section` via App.tsx route table (/a3/plans vs /a3/subs).
  // We also support a /a3 redirect landing on /a3/subs.
  const navigate = useNavigate();

  // If the router hands us a section prop but the URL is /a3 (no sub-path),
  // normalize. (App.tsx redirects /a3 → /a3/subs so this is a defensive default.)
  const initialSubView: SubViewKey = section === "plans" ? "planes" : "suscripciones";
  const [subView, setSubView] = useState<SubViewKey>(initialSubView);

  const [plans, setPlans] = useState<PlanResponse[]>([]);
  const [subscriptions, setSubscriptions] = useState<SubscriptionResponse[]>([]);
  const [plansRefetchToken, setPlansRefetchToken] = useState(0);
  const [subsRefetchToken, setSubsRefetchToken] = useState(0);

  const plansFetcher = useCallback(
    async (p: { page: number; limit: number }) => {
      void plansRefetchToken;
      return listA3Plans({ page: p.page, limit: p.limit });
    },
    [plansRefetchToken],
  );
  const {
    data: plansData,
    page: plansPage,
    setPage: setPlansPage,
    total: plansTotal,
    totalPages: plansTotalPages,
    limit: plansLimit,
  } = usePaginatedQuery<PlanResponse>({ fetcher: plansFetcher });

  // Keep local plans list in sync with the paginated data (PlanesView renders
  // from this list so it can pick out the selected plan by id).
  useEffect(() => {
    setPlans(plansData);
  }, [plansData]);

  const subsFetcher = useCallback(
    async (p: { page: number; limit: number }) => {
      void subsRefetchToken;
      return listA3({ page: p.page, limit: p.limit });
    },
    [subsRefetchToken],
  );
  const {
    data: subsData,
    page: subsPage,
    setPage: setSubsPage,
    total: subsTotal,
    totalPages: subsTotalPages,
    limit: subsLimit,
  } = usePaginatedQuery<SubscriptionResponse>({ fetcher: subsFetcher });

  useEffect(() => {
    setSubscriptions(subsData);
  }, [subsData]);

  // "planes"/"suscripciones" stay URL-aware (clicking those tabs navigates,
  // keeping the `section`-prop URL sync intact — byte-identical to before).
  // "crear-plan"/"suscribir" are NOT route-driven — selecting them only
  // switches the local tab state, the URL stays put.
  function handleSubViewChange(next: SubViewKey) {
    setSubView(next);
    if (next === "planes") navigate("/a3/plans");
    else if (next === "suscripciones") navigate("/a3/subs");
  }

  return (
    <div>
      <div className="mb-4">
        <h2 className="text-xl font-semibold text-gray-900 mb-1">A.3 — Preapproval Plan</h2>
        <p className="text-sm text-gray-500">
          Two-step flow: create a plan template, then subscribe a payer either via checkout
          redirect or directly via API with a card token.
        </p>
      </div>

      {/* Secondary sub-nav — "Planes"/"Suscripciones" stay URL-aware and
          route-driven exactly as before. "Crear plan"/"Suscribir a plan"
          are new full-page create views (replacing the old create
          Drawers), NOT route-driven. */}
      <div className="mb-6">
        <SubViewToggle
          value={subView}
          onChange={handleSubViewChange}
          opts={[
            { key: "planes", label: "Planes" },
            { key: "suscripciones", label: "Suscripciones" },
            { key: "crear-plan", label: "Crear plan" },
            { key: "suscribir", label: "Suscribir a plan" },
          ]}
        />
      </div>

      {/* PlanesView and SuscripcionesView stay mounted across EVERY subView
          switch. Each view decides internally (via `activeSubView`)
          whether to show its own main master-detail content, its own
          full-page create view, or nothing. The create views render the
          live "Solicitud MP" preview panel as a second column, fed by
          each view's own in-progress form state via
          `buildPlanPayload`/`buildSubscribePayload` — the SAME builders
          the real submit uses. This is what lets a user select "Crear
          plan"/"Suscribir a plan" and watch the matching preview update
          live, side by side with the form, as they keep typing. */}
      <PlanesView
        activeSubView={subView}
        plans={plans}
        onPlansRefresh={() => setPlansRefetchToken((n) => n + 1)}
        page={plansPage}
        totalPages={plansTotalPages}
        total={plansTotal}
        limit={plansLimit}
        onPageChange={setPlansPage}
        onSwitchToMain={() => setSubView("planes")}
      />
      <SuscripcionesView
        activeSubView={subView}
        plans={plans}
        subscriptions={subscriptions}
        onSubscriptionsRefresh={() => setSubsRefetchToken((n) => n + 1)}
        page={subsPage}
        totalPages={subsTotalPages}
        total={subsTotal}
        limit={subsLimit}
        onPageChange={setSubsPage}
        onSwitchToMain={() => setSubView("suscripciones")}
      />
    </div>
  );
}
