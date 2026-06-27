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
    endDate?: string;
    freeTrial?: {
      frequency: number;
      frequencyType: "months" | "days";
      firstInvoiceOffset?: number;
    };
    repetitions?: number;
  };
  backUrl?: string;
  paymentMethodsAllowed?: {
    paymentTypes?: string[];
    paymentMethods?: string[];
  };
}

export interface SubscribeToPlanInput {
  preapprovalPlanId: string;
  payerEmail: string;
  externalReference: string;
  cardTokenId?: string;
  backUrl?: string;
  reason?: string;
  // Optional full auto_recurring override — empirical probe: does MP honor per-subscription
  // values over the plan's values? All fields are optional; include only what the caller fills.
  autoRecurring?: {
    frequency?: number;
    frequencyType?: "months" | "days";
    amount?: number;
    currency?: string;
    startDate?: string;
    endDate?: string;
    billingDay?: number;
    freeTrial?: {
      frequency: number;
      frequencyType: "months" | "days";
      firstInvoiceOffset?: number;
    };
  };
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
        ...(input.autoRecurring.endDate !== undefined
          ? { end_date: input.autoRecurring.endDate }
          : {}),
        ...(input.autoRecurring.freeTrial !== undefined
          ? {
              free_trial: {
                frequency: input.autoRecurring.freeTrial.frequency,
                frequency_type: input.autoRecurring.freeTrial.frequencyType,
                ...(input.autoRecurring.freeTrial.firstInvoiceOffset !== undefined
                  ? { first_invoice_offset: input.autoRecurring.freeTrial.firstInvoiceOffset }
                  : {}),
              },
            }
          : {}),
        ...(input.autoRecurring.repetitions !== undefined
          ? { repetitions: input.autoRecurring.repetitions }
          : {}),
      },
      ...(input.paymentMethodsAllowed
        ? {
            payment_methods_allowed: {
              ...(input.paymentMethodsAllowed.paymentTypes?.length
                ? {
                    payment_types: input.paymentMethodsAllowed.paymentTypes.map(
                      (id) => ({ id }),
                    ),
                  }
                : {}),
              ...(input.paymentMethodsAllowed.paymentMethods?.length
                ? {
                    payment_methods: input.paymentMethodsAllowed.paymentMethods.map(
                      (id) => ({ id }),
                    ),
                  }
                : {}),
            },
          }
        : {}),
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

  // When subscribing to a plan via API (card_token_id path), MP requires status: "authorized".
  // Without it, the subscription is created in "pending" and never activates.
  //
  // The auto_recurring block is a deliberate override probe: the caller can supply any subset
  // of fields (frequency, amount, currency, dates, billingDay, freeTrial) to empirically test
  // whether MP honors per-subscription auto_recurring values over the plan's own values.
  // We cast to any because a partial auto_recurring does not satisfy the SDK's stricter type —
  // that's intentional here, since we want to send exactly what the experiment requires.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const body: any = {
    preapproval_plan_id: input.preapprovalPlanId,
    payer_email: input.payerEmail,
    external_reference: input.externalReference,
    ...(input.cardTokenId ? { card_token_id: input.cardTokenId } : {}),
    ...(input.cardTokenId ? { status: "authorized" } : {}),
    ...(input.backUrl ? { back_url: input.backUrl } : {}),
    ...(input.reason ? { reason: input.reason } : {}),
  };

  // Build auto_recurring from the override object — only include the block when at least
  // one field is provided; omit entirely when the override is absent or empty.
  if (input.autoRecurring) {
    const ar = input.autoRecurring;
    const arBlock: Record<string, unknown> = {};
    if (ar.frequency !== undefined) arBlock.frequency = ar.frequency;
    if (ar.frequencyType !== undefined) arBlock.frequency_type = ar.frequencyType;
    if (ar.amount !== undefined) arBlock.transaction_amount = ar.amount;
    if (ar.currency !== undefined) arBlock.currency_id = ar.currency;
    if (ar.startDate !== undefined) arBlock.start_date = ar.startDate;
    if (ar.endDate !== undefined) arBlock.end_date = ar.endDate;
    if (ar.billingDay !== undefined) arBlock.billing_day = ar.billingDay;
    if (ar.freeTrial !== undefined) {
      const ft: Record<string, unknown> = {
        frequency: ar.freeTrial.frequency,
        frequency_type: ar.freeTrial.frequencyType,
      };
      if (ar.freeTrial.firstInvoiceOffset !== undefined) {
        ft.first_invoice_offset = ar.freeTrial.firstInvoiceOffset;
      }
      arBlock.free_trial = ft;
    }
    if (Object.keys(arBlock).length > 0) {
      body.auto_recurring = arBlock;
    }
  }

  return preApproval.create({
    body,
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
