import { PreApproval, PreApprovalPlan } from "mercadopago";
import type { MercadoPagoConfig } from "mercadopago";

/** Return types derived from the public SDK — avoids importing internal dist paths. */
type PreApprovalPlanResult = Awaited<
  ReturnType<InstanceType<typeof PreApprovalPlan>["create"]>
>;
type PreApprovalResult = Awaited<
  ReturnType<InstanceType<typeof PreApproval>["create"]>
>;
type PreApprovalGetResult = Awaited<
  ReturnType<InstanceType<typeof PreApproval>["get"]>
>;

export interface CreatePlanInput {
  reason: string;
  autoRecurring: {
    frequency: number;
    frequencyType: "months" | "days";
    amount: number;
    currency: string;
    billingDay?: number;
    billingDayProportional?: boolean;
  };
  backUrl?: string;
}

export interface SubscribeToPlanInput {
  preapprovalPlanId: string;
  payerEmail: string;
  externalReference: string;
  cardTokenId?: string;
  backUrl?: string;
}

/**
 * Create a PreApprovalPlan (plan template) in MercadoPago.
 * The returned object includes id (mpPlanId) and init_point (public checkout link).
 */
export async function createPlan(
  client: MercadoPagoConfig,
  input: CreatePlanInput,
): Promise<PreApprovalPlanResult> {
  const plan = new PreApprovalPlan(client);

  return plan.create({
    body: {
      reason: input.reason,
      ...(input.backUrl ? { back_url: input.backUrl } : {}),
      auto_recurring: {
        frequency: input.autoRecurring.frequency,
        frequency_type: input.autoRecurring.frequencyType,
        transaction_amount: input.autoRecurring.amount,
        currency_id: input.autoRecurring.currency,
        ...(input.autoRecurring.billingDay !== undefined
          ? { billing_day: input.autoRecurring.billingDay }
          : {}),
        ...(input.autoRecurring.billingDayProportional !== undefined
          ? {
              billing_day_proportional:
                input.autoRecurring.billingDayProportional,
            }
          : {}),
      },
    },
  });
}

/**
 * Retrieve a PreApprovalPlan by its MP id.
 */
export async function getPlan(
  client: MercadoPagoConfig,
  planId: string,
): Promise<PreApprovalPlanResult> {
  const plan = new PreApprovalPlan(client);
  return plan.get({ preApprovalPlanId: planId });
}

/**
 * Subscribe a payer to an existing plan via the API (requires card_token_id).
 * Amount and recurrence are inherited from the plan — no need to re-specify them.
 *
 * Status note: MP may return any status for a plan-based preapproval (e.g. "authorized",
 * "pending"). We do NOT hard-code an expected status — we persist whatever MP returns.
 */
export async function subscribeToPlan(
  client: MercadoPagoConfig,
  input: SubscribeToPlanInput,
): Promise<PreApprovalResult> {
  const preApproval = new PreApproval(client);

  return preApproval.create({
    body: {
      preapproval_plan_id: input.preapprovalPlanId,
      payer_email: input.payerEmail,
      external_reference: input.externalReference,
      ...(input.cardTokenId ? { card_token_id: input.cardTokenId } : {}),
      ...(input.backUrl ? { back_url: input.backUrl } : {}),
    },
    requestOptions: {
      idempotencyKey: crypto.randomUUID(),
    },
  });
}

/**
 * Retrieve an A.3 PreApproval subscription by its MP id.
 */
export async function getA3Subscription(
  client: MercadoPagoConfig,
  mpId: string,
): Promise<PreApprovalGetResult> {
  const preApproval = new PreApproval(client);
  return preApproval.get({ id: mpId });
}
