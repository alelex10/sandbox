import { useState, useEffect } from "react";
import { Drawer } from "./Drawer.js";
import { AdvancedSection } from "./AdvancedSection.js";
import { updatePlan } from "../api.js";
import type { PlanResponse } from "../api.js";
import type { UpdatePlanRequest } from "shared";

// ---------------------------------------------------------------------------
// Form state — all fields are strings to match <input> values; booleans kept
// as booleans. We build the typed UpdatePlanRequest payload only on submit.
// ---------------------------------------------------------------------------

interface EditPlanFormState {
  reason: string;
  status: "active" | "inactive";
  // autoRecurring fields
  frequency: string;
  frequencyType: "months" | "days";
  amount: string;
  currency: string;
  billingDay: string;
  billingDayProportional: boolean;
  repetitions: string;
  freeTrialFrequency: string;
  freeTrialFrequencyType: "months" | "days";
  freeTrialFirstInvoiceOffset: string;
  // top-level optional fields
  backUrl: string;
  // payment methods
  paymentTypesAllowed: string[];
  paymentMethodsAllowed: string[];
}

// ---------------------------------------------------------------------------
// Build initial form state from a raw MP plan JSON snapshot.
// source is the parsed rawLastSearch or rawCreate object (or null).
// ---------------------------------------------------------------------------

function buildInitialFromSource(source: unknown): EditPlanFormState {
  const src = (source ?? {}) as Record<string, unknown>;
  const ar = (src.auto_recurring ?? {}) as Record<string, unknown>;
  const ft = (ar.free_trial ?? {}) as Record<string, unknown>;
  const pma = (src.payment_methods_allowed ?? {}) as Record<string, unknown>;

  const paymentTypes = Array.isArray(pma.payment_types)
    ? (pma.payment_types as Array<{ id?: string }>).map((t) => t.id ?? "").filter(Boolean)
    : [];
  const paymentMethods = Array.isArray(pma.payment_methods)
    ? (pma.payment_methods as Array<{ id?: string }>).map((m) => m.id ?? "").filter(Boolean)
    : [];

  return {
    reason: typeof src.reason === "string" ? src.reason : "",
    status: src.status === "inactive" ? "inactive" : "active",
    frequency: ar.frequency != null ? String(ar.frequency) : "",
    frequencyType:
      ar.frequency_type === "days" || ar.frequency_type === "months"
        ? ar.frequency_type
        : "months",
    amount: ar.transaction_amount != null ? String(ar.transaction_amount) : "",
    currency: typeof ar.currency_id === "string" ? ar.currency_id : "",
    billingDay: ar.billing_day != null ? String(ar.billing_day) : "",
    billingDayProportional: ar.billing_day_proportional === true,
    repetitions: ar.repetitions != null ? String(ar.repetitions) : "",
    freeTrialFrequency: ft.frequency != null ? String(ft.frequency) : "",
    freeTrialFrequencyType:
      ft.frequency_type === "days" || ft.frequency_type === "months"
        ? ft.frequency_type
        : "months",
    freeTrialFirstInvoiceOffset:
      ft.first_invoice_offset != null ? String(ft.first_invoice_offset) : "",
    backUrl: typeof src.back_url === "string" ? src.back_url : "",
    paymentTypesAllowed: paymentTypes,
    paymentMethodsAllowed: paymentMethods,
  };
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface EditPlanDrawerProps {
  open: boolean;
  onClose: () => void;
  plan: PlanResponse;
  /** rawLastSearch ?? rawCreate ?? null — resolved by the parent. */
  prefillSource: unknown;
  onUpdated: (updated: PlanResponse) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function EditPlanDrawer({
  open,
  onClose,
  plan,
  prefillSource,
  onUpdated,
}: EditPlanDrawerProps) {
  const [form, setForm] = useState<EditPlanFormState>(() =>
    buildInitialFromSource(prefillSource),
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Re-initialize form on each open — "fresh form on every open" contract.
  // useState lazy init is NOT sufficient across re-opens because React doesn't
  // re-run the initializer when open flips false→true.
  useEffect(() => {
    if (open) {
      setForm(buildInitialFromSource(prefillSource));
      setError(null);
    }
  }, [open, prefillSource]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      // Build a partial payload — only include fields that are non-empty / set.
      const payload: UpdatePlanRequest = {};

      if (form.reason.trim()) payload.reason = form.reason.trim();
      payload.status = form.status;
      if (form.backUrl.trim()) payload.backUrl = form.backUrl.trim();

      // autoRecurring block — only send if at least one sub-field is set
      const hasFrequency = form.frequency.trim() !== "";
      const hasAmount = form.amount.trim() !== "";
      const hasCurrency = form.currency.trim().length === 3;
      const hasBillingDay = form.billingDay.trim() !== "";
      const hasRepetitions = form.repetitions.trim() !== "";
      const hasFreeTrialFrequency = form.freeTrialFrequency.trim() !== "";

      if (hasFrequency || hasAmount || hasCurrency || hasBillingDay || hasRepetitions || hasFreeTrialFrequency) {
        payload.autoRecurring = {
          ...(hasFrequency ? { frequency: Number(form.frequency) } : {}),
          ...(form.frequencyType ? { frequencyType: form.frequencyType } : {}),
          ...(hasAmount ? { amount: Number(form.amount) } : {}),
          ...(hasCurrency ? { currency: form.currency.trim().toUpperCase() } : {}),
          ...(hasRepetitions ? { repetitions: Number(form.repetitions) } : {}),
          ...(hasFreeTrialFrequency
            ? {
                freeTrial: {
                  frequency: Number(form.freeTrialFrequency),
                  frequencyType: form.freeTrialFrequencyType,
                  ...(form.freeTrialFirstInvoiceOffset.trim() !== ""
                    ? { firstInvoiceOffset: Number(form.freeTrialFirstInvoiceOffset) }
                    : {}),
                },
              }
            : {}),
        };
      }

      // billingDay — remap to top-level as in CreatePlanRequest; the route maps
      // it into autoRecurring for the payments layer.
      if (hasBillingDay) {
        payload.billingDay = Number(form.billingDay);
        payload.billingDayProportional = form.billingDayProportional;
      }

      // paymentMethodsAllowed
      if (form.paymentTypesAllowed.length > 0 || form.paymentMethodsAllowed.length > 0) {
        payload.paymentMethodsAllowed = {
          ...(form.paymentTypesAllowed.length > 0 ? { paymentTypes: form.paymentTypesAllowed } : {}),
          ...(form.paymentMethodsAllowed.length > 0 ? { paymentMethods: form.paymentMethodsAllowed } : {}),
        };
      }

      const updated = await updatePlan(plan.id, payload);
      onUpdated(updated);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al actualizar el plan");
    } finally {
      setSubmitting(false);
    }
  }

  const inputClass =
    "w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Editar plan (PreApprovalPlan)"
      dismissable={!submitting}
      width="default"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Status — update-only field */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Estado del plan
          </label>
          <select
            value={form.status}
            onChange={(e) =>
              setForm((prev) => ({
                ...prev,
                status: e.target.value as "active" | "inactive",
              }))
            }
            className={inputClass}
          >
            <option value="active">active</option>
            <option value="inactive">inactive</option>
          </select>
          {form.status === "inactive" && (
            <p className="mt-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
              Poner el plan en <strong>inactive</strong> puede detener la
              facturación de los suscriptores activos.
            </p>
          )}
        </div>

        {/* Reason */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Reason{" "}
            <span className="text-gray-400 font-normal">(opcional)</span>
          </label>
          <input
            type="text"
            value={form.reason}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, reason: e.target.value }))
            }
            placeholder="Monthly premium plan"
            className={inputClass}
          />
        </div>

        {/* Auto-recurring fieldset */}
        <fieldset className="border border-gray-200 rounded p-4 space-y-4">
          <legend className="text-sm font-medium text-gray-700 px-1">
            Auto-recurring billing{" "}
            <span className="text-gray-400 font-normal text-xs">
              (campos opcionales — cambiar en planes con suscriptores activos
              puede tener comportamiento no documentado en MP)
            </span>
          </legend>

          <div className="flex gap-4">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Frequency{" "}
                <span className="text-gray-400 font-normal">(opcional)</span>
              </label>
              <input
                type="number"
                value={form.frequency}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, frequency: e.target.value }))
                }
                min="1"
                placeholder="e.g. 1"
                className={inputClass}
              />
            </div>
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Type
              </label>
              <select
                value={form.frequencyType}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    frequencyType: e.target.value as "months" | "days",
                  }))
                }
                className={inputClass}
              >
                <option value="months">months</option>
                <option value="days">days</option>
              </select>
            </div>
          </div>

          <div className="flex gap-4">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Amount{" "}
                <span className="text-gray-400 font-normal">(opcional)</span>
              </label>
              <input
                type="number"
                value={form.amount}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, amount: e.target.value }))
                }
                min="0.01"
                step="0.01"
                placeholder="e.g. 1000"
                className={inputClass}
              />
            </div>
            <div className="w-28">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Currency{" "}
                <span className="text-gray-400 font-normal">(opcional)</span>
              </label>
              <input
                type="text"
                value={form.currency}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, currency: e.target.value }))
                }
                maxLength={3}
                minLength={3}
                pattern="[A-Za-z]{3}"
                placeholder="ARS"
                className={inputClass}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Billing day{" "}
              <span className="text-gray-400 font-normal">(opcional, 1–28)</span>
            </label>
            <input
              type="number"
              value={form.billingDay}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, billingDay: e.target.value }))
              }
              min="1"
              max="28"
              placeholder="Leave empty to keep current"
              className={inputClass}
            />
          </div>

          <label className="flex items-start gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={form.billingDayProportional}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  billingDayProportional: e.target.checked,
                }))
              }
              className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span>
              Cobro proporcional{" "}
              <span className="text-gray-400 font-normal">
                (billing_day_proportional — solo aplica si se envía billing day)
              </span>
            </span>
          </label>
        </fieldset>

        {/* Advanced section */}
        <AdvancedSection>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Back URL{" "}
              <span className="text-gray-400 font-normal">(opcional)</span>
            </label>
            <input
              type="url"
              value={form.backUrl}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, backUrl: e.target.value }))
              }
              placeholder="https://example.com/return"
              className={inputClass}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Repetitions{" "}
              <span className="text-gray-400 font-normal">
                (autoRecurring.repetitions, opcional)
              </span>
            </label>
            <input
              type="number"
              value={form.repetitions}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, repetitions: e.target.value }))
              }
              min="1"
              placeholder="e.g. 12"
              className={inputClass}
            />
          </div>

          <fieldset className="border border-gray-100 rounded p-3 space-y-3">
            <legend className="text-xs font-medium text-gray-600 px-1">
              Free trial (opcional — completar frequency para activar)
            </legend>
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Frequency
                </label>
                <input
                  type="number"
                  value={form.freeTrialFrequency}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      freeTrialFrequency: e.target.value,
                    }))
                  }
                  min="1"
                  placeholder="e.g. 1"
                  className={inputClass}
                />
              </div>
              <div className="flex-1">
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Type
                </label>
                <select
                  value={form.freeTrialFrequencyType}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      freeTrialFrequencyType: e.target.value as "months" | "days",
                    }))
                  }
                  className={inputClass}
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
                  value={form.freeTrialFirstInvoiceOffset}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      freeTrialFirstInvoiceOffset: e.target.value,
                    }))
                  }
                  min="0"
                  placeholder="e.g. 0"
                  className={inputClass}
                />
              </div>
            </div>
          </fieldset>

          <div>
            <p className="text-xs font-medium text-gray-700 mb-2">
              Payment types allowed
            </p>
            <div className="flex flex-wrap gap-3">
              {(
                [
                  "credit_card",
                  "debit_card",
                  "ticket",
                  "bank_transfer",
                ] as const
              ).map((pt) => (
                <label
                  key={pt}
                  className="flex items-center gap-1.5 text-xs text-gray-700 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={form.paymentTypesAllowed.includes(pt)}
                    onChange={(e) =>
                      setForm((prev) => ({
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
            <p className="text-xs font-medium text-gray-700 mb-2">
              Payment methods allowed
            </p>
            <div className="flex flex-wrap gap-3">
              {(
                ["visa", "master", "amex", "naranja", "cabal"] as const
              ).map((pm) => (
                <label
                  key={pm}
                  className="flex items-center gap-1.5 text-xs text-gray-700 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={form.paymentMethodsAllowed.includes(pm)}
                    onChange={(e) =>
                      setForm((prev) => ({
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

        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full bg-blue-600 text-white rounded px-4 py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {submitting ? "Actualizando…" : "Actualizar plan"}
        </button>
      </form>
    </Drawer>
  );
}
