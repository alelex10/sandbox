/**
 * B — Orders / Automatic Payments
 *
 * This module uses raw HTTP fetch (NOT the SDK) because /v1/profiles/payment
 * and /v1/orders are not covered by the mercadopago Node SDK.
 *
 * Both functions accept the MP access token as an explicit parameter so this
 * module stays free of Express, Prisma, and dotenv imports.
 */

const MP_API_BASE = "https://api.mercadopago.com";

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

export interface CreatePaymentProfileInput {
  /** MP Bearer access token — injected by the route layer. */
  accessToken: string;
  /** Card token (single-use) from MercadoPago.js v2 or Card Payment Brick. */
  cardToken: string;
  /**
   * Payment method id as reported by MP (e.g. "visa", "master").
   * Sent as the `id` field inside payment_methods[].
   */
  paymentMethodId: string;
  /** Card type sent to MP inside payment_methods[].type. Defaults to "credit_card". */
  cardType: "credit_card" | "debit_card";
  /** Human-readable name shown on the customer statement. */
  statementDescriptor?: string;
}

export interface ChargeOrderInput {
  /** MP Bearer access token — injected by the route layer. */
  accessToken: string;
  /** customer_id returned by /v1/profiles/payment (stored on the Subscription). */
  customerId: string;
  /** payment_profile_id returned by /v1/profiles/payment. */
  paymentProfileId: string;
  /** Charge amount. MP Orders expects a string with two decimal places. */
  amount: number;
  /** External reference for this charge (for reconciliation). */
  externalReference: string;
  /** Optional sequence number in the subscription series. */
  sequenceNumber?: number;
  /** Order-level processing mode. Defaults to "automatic_async" when absent. */
  processingMode?: "automatic" | "automatic_async";
  /** Human-readable description for the order. */
  description?: string;
  /** Number of automatic retry attempts. Defaults to 3 when absent. */
  retries?: number;
  /** Total number of charges expected in this subscription series. */
  sequenceTotal?: number;
  /** MP subscription id to link this charge to a specific subscription. */
  subscriptionMpId?: string;
  /** Invoice id for this charge. */
  invoiceId?: string;
  /** Invoice billing date (ISO string). */
  invoiceBillingDate?: string;
  /** Billing period interval (number). */
  invoicePeriodInterval?: number;
  /** Billing period type (e.g. "monthly"). */
  invoicePeriodType?: string;
  /** Whether this is the first payment in the series. Defaults to false. */
  firstPayment?: boolean;
  /** Reference to the previous transaction for stored credential continuity. */
  previousTransactionReference?: string;
}

// ---------------------------------------------------------------------------
// Internal helper
// ---------------------------------------------------------------------------

async function mpRawFetch(
  accessToken: string,
  path: string,
  init: RequestInit = {},
): Promise<unknown> {
  const url = `${MP_API_BASE}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
      ...init.headers,
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`MP API error ${res.status}: ${text}`);
  }
  return res.json() as Promise<unknown>;
}

// ---------------------------------------------------------------------------
// createPaymentProfile
// ---------------------------------------------------------------------------

/**
 * Register a card as a stored payment method in MercadoPago.
 *
 * Calls POST /v1/profiles/payment (raw HTTP — this endpoint is not covered
 * by the mercadopago Node SDK).
 *
 * Confirmed body shape (source: 04-orders-automatic-payments.md notes +
 * MP docs cross-reference):
 *   {
 *     statement_descriptor: string,
 *     payment_methods: [{ id, type: "credit_card", token, default_method: true }]
 *   }
 *
 * Key response fields:
 *   - id              → payment_profile_id
 *   - status          → "READY" when usable
 *   - customer_id     → MP customer that owns this profile
 *   - payment_methods[].card_id
 *   - payment_methods[].last_four_digits
 */
export async function createPaymentProfile(
  input: CreatePaymentProfileInput,
): Promise<unknown> {
  const body = {
    statement_descriptor: input.statementDescriptor ?? "SANDBOX",
    payment_methods: [
      {
        id: input.paymentMethodId,
        type: input.cardType,
        token: input.cardToken,
        default_method: true,
      },
    ],
  };

  return mpRawFetch(input.accessToken, "/v1/profiles/payment", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

// ---------------------------------------------------------------------------
// chargeOrder
// ---------------------------------------------------------------------------

/**
 * Trigger a charge against a stored payment profile via POST /v1/orders.
 *
 * Each call generates a fresh X-Idempotency-Key — charges are always
 * independent, never deduplicated against prior charges for the same profile.
 *
 * Confirmed body shape (source: 04-orders-automatic-payments.md notes):
 *   type: "online"
 *   processing_mode: "automatic_async"  (retries on failure)
 *   payer.customer_id
 *   transactions.payments[].amount (string, 2 decimal places)
 *   transactions.payments[].automatic_payments.payment_profile_id
 *   transactions.payments[].automatic_payments.retries: 3
 *   transactions.payments[].automatic_payments.subscription.sequence (optional)
 *   transactions.payments[].stored_credential.payment_initiator: "customer"
 *   transactions.payments[].stored_credential.reason: "recurring"
 *   transactions.payments[].stored_credential.first_payment: false
 */
export async function chargeOrder(input: ChargeOrderInput): Promise<unknown> {
  const idempotencyKey = crypto.randomUUID();
  const amountStr = input.amount.toFixed(2);

  // Build subscription sub-object only when at least one field is provided.
  const hasSequence =
    input.sequenceNumber !== undefined || input.sequenceTotal !== undefined;
  const hasInvoice =
    input.invoiceId !== undefined ||
    input.invoiceBillingDate !== undefined ||
    input.invoicePeriodInterval !== undefined ||
    input.invoicePeriodType !== undefined;
  const hasSubscription = hasSequence || hasInvoice || input.subscriptionMpId !== undefined;

  const subscriptionField: Record<string, unknown> | undefined = hasSubscription
    ? {
        ...(input.subscriptionMpId !== undefined
          ? { id: input.subscriptionMpId }
          : {}),
        ...(hasSequence
          ? {
              sequence: {
                ...(input.sequenceNumber !== undefined
                  ? { number: input.sequenceNumber }
                  : {}),
                ...(input.sequenceTotal !== undefined
                  ? { total: input.sequenceTotal }
                  : {}),
              },
            }
          : {}),
        ...(hasInvoice
          ? {
              invoice: {
                ...(input.invoiceId !== undefined
                  ? { id: input.invoiceId }
                  : {}),
                ...(input.invoiceBillingDate !== undefined
                  ? { billing_date: input.invoiceBillingDate }
                  : {}),
                ...(input.invoicePeriodInterval !== undefined ||
                input.invoicePeriodType !== undefined
                  ? {
                      period: {
                        ...(input.invoicePeriodInterval !== undefined
                          ? { interval: input.invoicePeriodInterval }
                          : {}),
                        ...(input.invoicePeriodType !== undefined
                          ? { type: input.invoicePeriodType }
                          : {}),
                      },
                    }
                  : {}),
              },
            }
          : {}),
      }
    : undefined;

  const payment: Record<string, unknown> = {
    amount: amountStr,
    automatic_payments: {
      payment_profile_id: input.paymentProfileId,
      retries: input.retries ?? 3,
      ...(subscriptionField !== undefined
        ? { subscription: subscriptionField }
        : {}),
    },
    stored_credential: {
      payment_initiator: "customer",
      reason: "recurring",
      first_payment: input.firstPayment ?? false,
      ...(input.previousTransactionReference !== undefined
        ? { previous_transaction_reference: input.previousTransactionReference }
        : {}),
    },
  };

  const orderBody: Record<string, unknown> = {
    type: "online",
    external_reference: input.externalReference,
    total_amount: amountStr,
    processing_mode: input.processingMode ?? "automatic_async",
    payer: {
      customer_id: input.customerId,
    },
    transactions: {
      payments: [payment],
    },
    ...(input.description !== undefined ? { description: input.description } : {}),
  };

  return mpRawFetch(input.accessToken, "/v1/orders", {
    method: "POST",
    headers: {
      "X-Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify(orderBody),
  });
}
