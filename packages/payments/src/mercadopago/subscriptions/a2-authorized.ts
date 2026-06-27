import { PreApproval } from "mercadopago";
import type { MercadoPagoConfig } from "mercadopago";

/** Return type derived from the public SDK — avoids importing internal dist paths. */
type PreApprovalResult = Awaited<ReturnType<InstanceType<typeof PreApproval>["create"]>>;

export interface CreateA2Input {
  reason: string;
  payerEmail: string;
  externalReference: string;
  backUrl?: string;
  cardTokenId: string;
  autoRecurring: {
    frequency: number;
    frequencyType: "months" | "days";
    amount: number;
    currency: string;
    startDate?: string;
    endDate?: string;
    freeTrial?: {
      frequency: number;
      frequencyType: "months" | "days";
      firstInvoiceOffset?: number;
    };
    repetitions?: number;
  };
}

/**
 * Create a PreApproval subscription with status "authorized".
 * Requires a card_token_id obtained from the frontend tokenization step.
 * The client must be produced by mpClient() — no config is constructed here.
 */
export async function createA2(
  client: MercadoPagoConfig,
  input: CreateA2Input,
): Promise<PreApprovalResult> {
  const preApproval = new PreApproval(client);

  return preApproval.create({
    body: {
      reason: input.reason,
      payer_email: input.payerEmail,
      external_reference: input.externalReference,
      ...(input.backUrl ? { back_url: input.backUrl } : {}),
      card_token_id: input.cardTokenId,
      status: "authorized",
      auto_recurring: {
        frequency: input.autoRecurring.frequency,
        frequency_type: input.autoRecurring.frequencyType,
        transaction_amount: input.autoRecurring.amount,
        currency_id: input.autoRecurring.currency,
        start_date: input.autoRecurring.startDate,
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
    },
    requestOptions: {
      idempotencyKey: crypto.randomUUID(),
    },
  });
}

/**
 * Retrieve a PreApproval subscription by its MP id.
 */
export async function getA2(
  client: MercadoPagoConfig,
  mpId: string,
): Promise<PreApprovalResult> {
  const preApproval = new PreApproval(client);
  return preApproval.get({ id: mpId });
}
