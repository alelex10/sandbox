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
import { ThreeColumnLayout } from "../components/ThreeColumnLayout.js";
import { HistorySidebar } from "../components/HistorySidebar.js";
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

type SubView = "planes" | "suscripciones" | "notas";
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
// Plans sub-view (master-detail)
// ---------------------------------------------------------------------------

function PlanesView({
  plans,
  onPlansRefresh,
}: {
  plans: PlanResponse[];
  onPlansRefresh: () => Promise<void>;
}) {
  // Master selection
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [planDetail, setPlanDetail] = useState<PlanDetailResponse | null>(null);
  const [planDetailLoading, setPlanDetailLoading] = useState(false);
  const [deletingAll, setDeletingAll] = useState(false);

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

  async function handleDeletePlan(id: string) {
    if (!window.confirm("¿Eliminar este registro del historial? (borrado lógico, los datos se conservan)")) return;
    try {
      await deletePlan(id);
      await onPlansRefresh();
      if (selectedPlanId === id) {
        setSelectedPlanId(null);
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
      await onPlansRefresh();
      setSelectedPlanId(null);
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
    setSelectedPlanId(id);
    setMpSearchResult(null);
    setMpSearchError(null);
    void fetchPlanDetail(id);
  }

  async function handleCreatePlan(e: React.FormEvent) {
    e.preventDefault();
    setPlanError(null);
    setPlanSubmitting(true);
    try {
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
      const created = await createPlan(payload);
      setPlanResult(created);
      onPlansRefresh();
      // Auto-select the newly created plan
      setSelectedPlanId(created.id);
      void fetchPlanDetail(created.id);
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
    <ThreeColumnLayout
      sidebar={
        <HistorySidebar
          title="Planes guardados"
          items={plans}
          selectedId={selectedPlanId}
          onSelect={selectPlan}
          getId={(p) => p.id}
          onDelete={handleDeletePlan}
          onClearAll={handleClearAll}
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
      form={
        <div className="space-y-4 min-w-0">
          <Card title="Crear plan (PreApprovalPlan)">
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
        </div>
      }
      data={
        <>
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
                  <button
                    type="button"
                    onClick={() => {
                      if (selectedPlanId) void fetchPlanDetail(selectedPlanId);
                    }}
                    disabled={planDetailLoading}
                    className="ml-auto text-xs text-gray-500 hover:text-gray-700 disabled:opacity-50 shrink-0"
                    title="Refetch timeline"
                  >
                    {planDetailLoading ? "..." : "↻ Actualizar"}
                  </button>
                </div>
                {selectedPlan.initPoint && (
                  <div className="mb-4 p-2 bg-blue-50 border border-blue-200 rounded text-xs text-blue-700">
                    <a
                      href={selectedPlan.initPoint}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline font-medium"
                    >
                      Abrir link público del plan
                    </a>
                    <span className="ml-2 text-blue-500 break-all">{selectedPlan.initPoint}</span>
                  </div>
                )}
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

          {/* Webhooks card — plan-scoped. NO PaymentsDiag and NO cancel button: plans are not cancelled in MP. */}
          <Card title="Webhook Events (live feed)">
            <p className="text-xs text-gray-500 mb-3">
              {selectedPlanId
                ? "Live feed for all subscriptions of this plan."
                : "Method-level feed including unattributed events."}
              <span className="text-gray-400"> (polling every 5s)</span>
            </p>
            <WebhookList method="a3_plan" planId={selectedPlanId ?? undefined} />
          </Card>
        </>
      }
    />
  );
}

// ---------------------------------------------------------------------------
// Suscripciones sub-view (unchanged behavior from original A3Plan)
// ---------------------------------------------------------------------------

function SuscripcionesView({
  plans,
  subscriptions,
  onSubscriptionsRefresh,
}: {
  plans: PlanResponse[];
  subscriptions: SubscriptionResponse[];
  onSubscriptionsRefresh: () => Promise<void>;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<SubscriptionDetailResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [deletingAll, setDeletingAll] = useState(false);
  const [cancelling, setCancelling] = useState(false);

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
  const [subReason, setSubReason] = useState("");
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

  async function handleDeleteSub(id: string) {
    if (!window.confirm("¿Eliminar este registro del historial? (borrado lógico, los datos se conservan)")) return;
    try {
      await deleteA3(id);
      await onSubscriptionsRefresh();
      if (selectedId === id) {
        setSelectedId(null);
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
      await onSubscriptionsRefresh();
      setSelectedId(null);
      setDetail(null);
      setSearchResult(null);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "No se pudo eliminar");
    } finally {
      setDeletingAll(false);
    }
  }

  function selectSubscription(id: string) {
    setSelectedId(id);
    setDetail(null);
    setSearchResult(null);
    setSearchMpId("");
    setSearchError(null);
    void fetchDetail(id);
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
      if (subReason) payload.reason = subReason;
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
      const res = await subscribeToPlan(payload);
      setSubResult(res);
      setCardTokenId(null);
      setTokenSource(null);
      onSubscriptionsRefresh();
      setSelectedId(res.id);
      void fetchDetail(res.id);
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
    const confirmed = window.confirm(
      "¿Cancelar esta suscripción en MercadoPago? Es IRREVERSIBLE y deja de cobrar.",
    );
    if (!confirmed) return;
    setCancelling(true);
    try {
      await cancelSubscription(selectedId);
      await onSubscriptionsRefresh();
      void fetchDetail(selectedId);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "No se pudo cancelar");
    } finally {
      setCancelling(false);
    }
  }

  const selectedSub = subscriptions.find((s) => s.id === selectedId);

  return (
    <ThreeColumnLayout
      sidebar={
        <HistorySidebar
          title="Suscripciones"
          items={subscriptions}
          selectedId={selectedId}
          onSelect={selectSubscription}
          getId={(s) => s.id}
          onDelete={handleDeleteSub}
          onClearAll={handleClearAll}
          renderItem={(sub) => (
            <>
              <div className="font-mono text-gray-700 truncate">{sub.id.slice(0, 16)}…</div>
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
      form={
        <div className="space-y-4 min-w-0">
          {/* Subscribe card — tokenization, plan picker and form all live in the form slot, grouped. */}
          <Card title="Suscribir pagador">
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
                      onChange={(e) => setSubReason(e.target.value)}
                      placeholder="e.g. monthly plan"
                      className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
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
          </Card>
        </div>
      }
      data={
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
                    onClick={() => {
                      if (selectedId) void fetchDetail(selectedId);
                    }}
                    disabled={detailLoading}
                    className={`${selectedSub.status !== "cancelled" ? "" : "ml-auto "}text-xs text-gray-500 hover:text-gray-700 disabled:opacity-50`}
                    title="Refetch timeline"
                  >
                    {detailLoading ? "..." : "↻ Actualizar"}
                  </button>
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

          {/* Webhooks card */}
          <Card title="Webhook Events (live feed)">
            <p className="text-xs text-gray-500 mb-3">
              {selectedId
                ? `Live feed for subscription ${selectedId.slice(0, 8)}…`
                : "Method-level feed including unattributed events."}
              <span className="text-gray-400"> (polling every 5s)</span>
            </p>
            <WebhookList method="a3_plan" subscriptionId={selectedId ?? undefined} />
          </Card>
        </>
      }
    />
  );
}

// ---------------------------------------------------------------------------
// A3Plan page — root with sub-view toggle
// ---------------------------------------------------------------------------

export function A3Plan({ section }: { section?: "plans" | "subs" } = {}) {
  // Map router-driven `section` to the internal `SubView` so the URL drives
  // which sub-view opens by default. The user can still toggle freely with
  // the SubViewToggle — making the toggle URL-aware lands in PR5.
  const initialSubView: SubView = section === "subs" ? "suscripciones" : "planes";
  const [subView, setSubView] = useState<SubView>(initialSubView);
  useEffect(() => {
    setSubView(initialSubView);
  }, [section]);
  const [plans, setPlans] = useState<PlanResponse[]>([]);
  const [subscriptions, setSubscriptions] = useState<SubscriptionResponse[]>([]);

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

  return (
    <div>
      <div className="mb-4">
        <h2 className="text-xl font-semibold text-gray-900 mb-1">A.3 — Preapproval Plan</h2>
        <p className="text-sm text-gray-500">
          Two-step flow: create a plan template, then subscribe a payer either via checkout
          redirect or directly via API with a card token.
        </p>
      </div>

      {/* Sub-view toggle */}
      <div className="mb-6">
        <SubViewToggle
          value={subView}
          onChange={setSubView}
          opts={[
            { key: "planes", label: "Planes" },
            { key: "suscripciones", label: "Suscripciones" },
            { key: "notas", label: "Notas" },
          ]}
        />
      </div>

      {subView === "planes" ? (
        <PlanesView plans={plans} onPlansRefresh={fetchPlans} />
      ) : subView === "suscripciones" ? (
        <SuscripcionesView
          plans={plans}
          subscriptions={subscriptions}
          onSubscriptionsRefresh={fetchSubscriptions}
        />
      ) : (
        <NotesView method="a3_plan" />
      )}
    </div>
  );
}
