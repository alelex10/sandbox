import { z } from "zod";

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const SubscriptionMethod = z.enum([
  "a1_pending",
  "a2_authorized",
  "a3_plan",
  "b_orders",
]);
export type SubscriptionMethod = z.infer<typeof SubscriptionMethod>;

export const Tokenization = z.enum(["mercadopagojs", "brick"]);
export type Tokenization = z.infer<typeof Tokenization>;

// ---------------------------------------------------------------------------
// Shared sub-schemas
// ---------------------------------------------------------------------------

export const AutoRecurring = z.object({
  frequency: z.number().int().positive(),
  frequencyType: z.enum(["months", "days"]),
  amount: z.number().positive(),
  currency: z.string().length(3).default("ARS"),
  startDate: z.string().datetime().optional(),
});
export type AutoRecurring = z.infer<typeof AutoRecurring>;

// ---------------------------------------------------------------------------
// Request schemas
// ---------------------------------------------------------------------------

export const CreateA1Request = z.object({
  reason: z.string().min(1),
  payerEmail: z.string().email(),
  externalReference: z.string().min(1),
  autoRecurring: AutoRecurring,
});
export type CreateA1Request = z.infer<typeof CreateA1Request>;

export const CreateA2Request = CreateA1Request.extend({
  cardTokenId: z.string().min(1),
  tokenization: Tokenization,
});
export type CreateA2Request = z.infer<typeof CreateA2Request>;

export const CreatePlanRequest = z.object({
  reason: z.string().min(1),
  autoRecurring: AutoRecurring,
  billingDay: z.number().int().min(1).max(28).optional(),
});
export type CreatePlanRequest = z.infer<typeof CreatePlanRequest>;

export const SubscribeToPlanRequest = z.object({
  preapprovalPlanId: z.string().min(1),
  payerEmail: z.string().email(),
  externalReference: z.string().min(1),
  cardTokenId: z.string().min(1).optional(),
  tokenization: Tokenization.optional(),
});
export type SubscribeToPlanRequest = z.infer<typeof SubscribeToPlanRequest>;

export const CreatePaymentProfileRequest = z.object({
  cardTokenId: z.string().min(1),
  tokenization: Tokenization,
  paymentMethodId: z.string().min(1),
});
export type CreatePaymentProfileRequest = z.infer<typeof CreatePaymentProfileRequest>;

export const ChargeOrderRequest = z.object({
  subscriptionId: z.string().min(1),
  amount: z.number().positive(),
  sequenceNumber: z.number().int().positive().optional(),
});
export type ChargeOrderRequest = z.infer<typeof ChargeOrderRequest>;

// ---------------------------------------------------------------------------
// Response schemas
// ---------------------------------------------------------------------------

export const SubscriptionResponse = z.object({
  id: z.string(),
  method: SubscriptionMethod,
  mpId: z.string().nullable(),
  status: z.string().nullable(),
  initPoint: z.string().nullable(),
  rawCreate: z.unknown().nullable(),
  rawLastSearch: z.unknown().nullable(),
  createdAt: z.string(),
});
export type SubscriptionResponse = z.infer<typeof SubscriptionResponse>;

export const WebhookEventResponse = z.object({
  id: z.string(),
  method: z.string().nullable(),
  topic: z.string(),
  category: z.string(),
  action: z.string().nullable(),
  mpResourceId: z.string().nullable(),
  rawBody: z.unknown(),
  rawFetched: z.unknown().nullable(),
  receivedAt: z.string(),
});
export type WebhookEventResponse = z.infer<typeof WebhookEventResponse>;
