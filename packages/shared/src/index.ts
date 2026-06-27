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
  endDate: z.string().datetime().optional(),
  freeTrial: z
    .object({
      frequency: z.number().int().positive(),
      frequencyType: z.enum(["months", "days"]),
      firstInvoiceOffset: z.number().int().nonnegative().optional(),
    })
    .optional(),
  repetitions: z.number().int().positive().optional(),
});
export type AutoRecurring = z.infer<typeof AutoRecurring>;

// ---------------------------------------------------------------------------
// Request schemas
// ---------------------------------------------------------------------------

export const CreateA1Request = z.object({
  reason: z.string().min(1),
  payerEmail: z.string().email(),
  externalReference: z.string().min(1).optional(),
  backUrl: z.string().url().optional(),
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
  billingDayProportional: z.boolean().optional(),
  backUrl: z.string().url().optional(),
  paymentMethodsAllowed: z
    .object({
      paymentTypes: z.array(z.string()).optional(),
      paymentMethods: z.array(z.string()).optional(),
    })
    .optional(),
});
export type CreatePlanRequest = z.infer<typeof CreatePlanRequest>;

export const SubscribeToPlanRequest = z.object({
  preapprovalPlanId: z.string().min(1),
  payerEmail: z.string().email(),
  externalReference: z.string().min(1),
  cardTokenId: z.string().min(1).optional(),
  tokenization: Tokenization.optional(),
  backUrl: z.string().url().optional(),
  reason: z.string().min(1).optional(),
  // Optional full auto_recurring override — an empirical probe to test whether per-subscription
  // values override the plan's values in MercadoPago. All fields are optional so any subset
  // can be sent; MP may honor or silently ignore them.
  autoRecurring: z
    .object({
      frequency: z.number().int().positive().optional(),
      frequencyType: z.enum(["months", "days"]).optional(),
      amount: z.number().positive().optional(),
      currency: z.string().length(3).optional(),
      startDate: z.string().datetime().optional(),
      endDate: z.string().datetime().optional(),
      billingDay: z.number().int().min(1).max(28).optional(),
      freeTrial: z
        .object({
          frequency: z.number().int().positive(),
          frequencyType: z.enum(["months", "days"]),
          firstInvoiceOffset: z.number().int().nonnegative().optional(),
        })
        .optional(),
    })
    .optional(),
});
export type SubscribeToPlanRequest = z.infer<typeof SubscribeToPlanRequest>;

export const CreatePaymentProfileRequest = z.object({
  cardTokenId: z.string().min(1),
  tokenization: Tokenization,
  paymentMethodId: z.string().min(1),
  cardType: z.enum(["credit_card", "debit_card"]).default("credit_card"),
  statementDescriptor: z.string().optional(),
});
export type CreatePaymentProfileRequest = z.infer<typeof CreatePaymentProfileRequest>;

export const ChargeOrderRequest = z.object({
  subscriptionId: z.string().min(1),
  amount: z.number().positive(),
  sequenceNumber: z.number().int().positive().optional(),
  processingMode: z.enum(["automatic", "automatic_async"]).optional(),
  retries: z.number().int().min(0).max(5).optional(),
  sequenceTotal: z.number().int().positive().optional(),
  subscriptionMpId: z.string().optional(),
  invoiceId: z.string().optional(),
  invoiceBillingDate: z.string().optional(),
  invoicePeriodInterval: z.number().int().positive().optional(),
  invoicePeriodType: z.string().optional(),
  firstPayment: z.boolean().optional(),
  previousTransactionReference: z.string().optional(),
  description: z.string().optional(),
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
  tokenization: Tokenization.nullable().optional(),
  preapprovalPlanId: z.string().nullable().optional(),
  rawCreate: z.unknown().nullable(),
  rawLastSearch: z.unknown().nullable(),
  createdAt: z.string(),
});
export type SubscriptionResponse = z.infer<typeof SubscriptionResponse>;

export const SubscriptionSnapshotResponse = z.object({
  id: z.string(),
  kind: z.string(),
  statusAtTime: z.string().nullable(),
  raw: z.unknown(),
  createdAt: z.string(),
});
export type SubscriptionSnapshotResponse = z.infer<typeof SubscriptionSnapshotResponse>;

export const TimelineEntryResponse = z.object({
  id: z.string(),
  type: z.enum(["create", "search", "webhook", "charge"]),
  label: z.string(),
  status: z.string().nullable(),
  at: z.string(),
  data: z.unknown(),
});
export type TimelineEntryResponse = z.infer<typeof TimelineEntryResponse>;

export const SubscriptionDetailResponse = SubscriptionResponse.extend({
  timeline: z.array(TimelineEntryResponse),
});
export type SubscriptionDetailResponse = z.infer<typeof SubscriptionDetailResponse>;

export const PlanResponse = z.object({
  id: z.string(),
  mpPlanId: z.string().nullable(),
  reason: z.string().nullable(),
  amount: z.number(),
  currency: z.string(),
  frequency: z.number(),
  frequencyType: z.string(),
  initPoint: z.string().nullable(),
  rawCreate: z.unknown().nullable(),
  rawLastSearch: z.unknown().nullable(),
  createdAt: z.string(),
});
export type PlanResponse = z.infer<typeof PlanResponse>;

export const PlanDetailResponse = PlanResponse.extend({
  timeline: z.array(TimelineEntryResponse),
});
export type PlanDetailResponse = z.infer<typeof PlanDetailResponse>;

export const WebhookEventResponse = z.object({
  id: z.string(),
  method: z.string().nullable(),
  topic: z.string(),
  category: z.string(),
  action: z.string().nullable(),
  mpResourceId: z.string().nullable(),
  subscriptionId: z.string().nullable(),
  rawBody: z.unknown(),
  rawFetched: z.unknown().nullable(),
  receivedAt: z.string(),
});
export type WebhookEventResponse = z.infer<typeof WebhookEventResponse>;

// ---------------------------------------------------------------------------
// Diagnostics — MP payments inspector
// ---------------------------------------------------------------------------

export const PaymentDiagResponse = z.object({
  id: z.string(),
  status: z.string().nullable(),
  statusDetail: z.string().nullable(),
  amount: z.number().nullable(),
  currency: z.string().nullable(),
  paymentMethodId: z.string().nullable(),
  dateCreated: z.string().nullable(),
  externalReference: z.string().nullable(),
  payerEmail: z.string().nullable(),
  raw: z.unknown(),
});
export type PaymentDiagResponse = z.infer<typeof PaymentDiagResponse>;

export const RecentPaymentsDiagResponse = z.object({
  payments: z.array(PaymentDiagResponse),
});
export type RecentPaymentsDiagResponse = z.infer<typeof RecentPaymentsDiagResponse>;

export const SubscriptionPaymentsDiagResponse = z.object({
  payments: z.array(PaymentDiagResponse),
  sources: z.array(z.string()),
  errors: z.array(z.string()).optional(),
});
export type SubscriptionPaymentsDiagResponse = z.infer<
  typeof SubscriptionPaymentsDiagResponse
>;

// ---------------------------------------------------------------------------
// Tunnel connectivity self-check
// ---------------------------------------------------------------------------

export const TunnelCheckResponse = z.discriminatedUnion("configured", [
  // MP_NOTIFICATION_URL not set
  z.object({
    configured: z.literal(false),
    verdict: z.string(),
  }),
  // MP_NOTIFICATION_URL set — result of the self-fetch
  z.object({
    configured: z.literal(true),
    configuredUrl: z.string(),
    checkedUrl: z.string().optional(),
    reachable: z.boolean(),
    status: z.number().nullable().optional(),
    isOurJson: z.boolean().optional(),
    looksLikeAuthWall: z.boolean().optional(),
    bodyPreview: z.string().nullable().optional(),
    verdict: z.string(),
    detail: z.string().optional(),
  }),
]);
export type TunnelCheckResponse = z.infer<typeof TunnelCheckResponse>;

// ---------------------------------------------------------------------------
// Notes
// ---------------------------------------------------------------------------

export const CreateNoteRequest = z.object({
  method: SubscriptionMethod,
  title: z.string().min(1).max(200),
  body: z.string().min(1),
});
export type CreateNoteRequest = z.infer<typeof CreateNoteRequest>;

export const UpdateNoteRequest = z
  .object({
    title: z.string().min(1).max(200).optional(),
    body: z.string().min(1).optional(),
  })
  .refine((d) => d.title !== undefined || d.body !== undefined, {
    message: "At least one of title or body must be provided",
  });
export type UpdateNoteRequest = z.infer<typeof UpdateNoteRequest>;

export const NoteResponse = z.object({
  id: z.string(),
  method: SubscriptionMethod,
  title: z.string(),
  body: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  deletedAt: z.string().nullable(),
});
export type NoteResponse = z.infer<typeof NoteResponse>;
