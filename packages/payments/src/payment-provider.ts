import { z } from "zod";

/**
 * Domain contract for any payment provider implementation.
 *
 * This file is provider-agnostic on purpose: it knows nothing about Mercado
 * Pago, Stripe, or any specific SDK. Each concrete implementation must satisfy
 * the {@link PaymentProvider} interface, which lets you swap implementations and
 * test them against the same contract.
 */

export const PaymentStatus = z.enum([
  "pending",
  "approved",
  "rejected",
  "cancelled",
]);
export type PaymentStatus = z.infer<typeof PaymentStatus>;

export const PaymentRequest = z.object({
  /** Amount to charge, in the major currency unit (e.g. 1000.5 ARS). */
  amount: z.number().positive(),
  /** ISO 4217 currency code (e.g. "ARS"). */
  currency: z.string().length(3),
  /** Human-readable description shown to the payer. */
  description: z.string().min(1),
  /** Your own id for this payment, echoed back by the provider/webhook. */
  externalReference: z.string().min(1),
  /** Email of the person paying. */
  payerEmail: z.string().email(),
});
export type PaymentRequest = z.infer<typeof PaymentRequest>;

export const PaymentResult = z.object({
  /** Provider-side id for the created payment/preference. */
  id: z.string(),
  status: PaymentStatus,
  externalReference: z.string(),
  /** URL to redirect the payer to in order to complete the checkout. */
  checkoutUrl: z.string().url().optional(),
  /** Raw provider payload, for debugging / provider-specific needs. */
  raw: z.unknown().optional(),
});
export type PaymentResult = z.infer<typeof PaymentResult>;

/**
 * The contract every payment implementation must fulfill. Write as many
 * Mercado Pago variants as you want (SDK-based, raw HTTP, sandbox, ...): as
 * long as they implement this interface, they are interchangeable and testable
 * against the same suite.
 */
export interface PaymentProvider {
  /** A stable name to identify the implementation in tests/logs. */
  readonly name: string;

  /** Create a payment/checkout and return where to send the payer. */
  createPayment(request: PaymentRequest): Promise<PaymentResult>;

  /** Fetch the current state of a previously created payment. */
  getPayment(id: string): Promise<PaymentResult>;
}
