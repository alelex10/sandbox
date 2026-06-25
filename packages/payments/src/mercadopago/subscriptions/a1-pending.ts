import { PreApproval } from "mercadopago";
import type { MercadoPagoConfig } from "mercadopago";

/** Return type derived from the public SDK — avoids importing internal dist paths. */
type PreApprovalResult = Awaited<ReturnType<InstanceType<typeof PreApproval>["create"]>>;

export interface CreateA1Input {
  reason: string;
  payerEmail: string;
  externalReference: string;
  backUrl: string;
  autoRecurring: {
    frequency: number;
    frequencyType: string;
    amount: number;
    currency: string;
    startDate?: string;
  };
}

/**
 * Create a PreApproval subscription with status "pending".
 * The MP response includes id, init_point, and status.
 * The client must be produced by mpClient() — no config is constructed here.
 */
export async function createA1(
  client: MercadoPagoConfig,
  input: CreateA1Input,
): Promise<PreApprovalResult> {
  const preApproval = new PreApproval(client);

  return preApproval.create({
    body: {
      reason: input.reason,
      payer_email: input.payerEmail,
      external_reference: input.externalReference,
      back_url: input.backUrl,
      status: "pending",
      auto_recurring: {
        frequency: input.autoRecurring.frequency,
        frequency_type: input.autoRecurring.frequencyType,
        transaction_amount: input.autoRecurring.amount,
        currency_id: input.autoRecurring.currency,
        start_date: input.autoRecurring.startDate,
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
export async function getA1(
  client: MercadoPagoConfig,
  mpId: string,
): Promise<PreApprovalResult> {
  const preApproval = new PreApproval(client);
  return preApproval.get({ id: mpId });
}
