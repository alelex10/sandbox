import { describe, it, expect } from "vitest";
import {
  buildPlanBody,
  buildSubscribeBody,
  type CreatePlanInput,
  type SubscribeToPlanInput,
} from "./a3-plan.js";

// Approval tests: lock in the EXACT snake_case MP request bodies
// `createPlan` and `subscribeToPlan` send today, before extracting them
// into standalone pure functions.
describe("buildPlanBody", () => {
  it("builds the full snake_case body for a fully-populated input", () => {
    const input: CreatePlanInput = {
      reason: "Plan mensual",
      autoRecurring: {
        frequency: 1,
        frequencyType: "months",
        amount: 1500,
        currency: "ARS",
        billingDay: 10,
        billingDayProportional: true,
        endDate: "2026-12-01T00:00:00.000Z",
        freeTrial: { frequency: 1, frequencyType: "months", firstInvoiceOffset: 0 },
        repetitions: 6,
      },
      backUrl: "https://example.com/back",
      paymentMethodsAllowed: {
        paymentTypes: ["credit_card"],
        paymentMethods: ["visa"],
      },
    };

    expect(buildPlanBody(input)).toEqual({
      reason: "Plan mensual",
      back_url: "https://example.com/back",
      auto_recurring: {
        frequency: 1,
        frequency_type: "months",
        transaction_amount: 1500,
        currency_id: "ARS",
        billing_day: 10,
        billing_day_proportional: true,
        end_date: "2026-12-01T00:00:00.000Z",
        free_trial: { frequency: 1, frequency_type: "months", first_invoice_offset: 0 },
        repetitions: 6,
      },
      payment_methods_allowed: {
        payment_types: [{ id: "credit_card" }],
        payment_methods: [{ id: "visa" }],
      },
    });
  });

  it("omits optional fields entirely when absent (minimal input)", () => {
    const input: CreatePlanInput = {
      reason: "Plan básico",
      autoRecurring: {
        frequency: 1,
        frequencyType: "days",
        amount: 200,
        currency: "ARS",
      },
    };

    expect(buildPlanBody(input)).toEqual({
      reason: "Plan básico",
      auto_recurring: {
        frequency: 1,
        frequency_type: "days",
        transaction_amount: 200,
        currency_id: "ARS",
      },
    });
  });
});

describe("buildSubscribeBody", () => {
  it("builds the API (card_token_id) path body with status authorized", () => {
    const input: SubscribeToPlanInput = {
      preapprovalPlanId: "plan-1",
      payerEmail: "payer@example.com",
      externalReference: "ext-ref-1",
      cardTokenId: "card-token-abc",
      backUrl: "https://example.com/back",
      notificationUrl: "https://example.com/notify",
      reason: "A.3 | tokenizacion (mercadopagojs) | card | #0001",
      autoRecurring: {
        frequency: 1,
        frequencyType: "months",
        amount: 1000,
        currency: "ARS",
      },
    };

    expect(buildSubscribeBody(input)).toEqual({
      preapproval_plan_id: "plan-1",
      payer_email: "payer@example.com",
      external_reference: "ext-ref-1",
      card_token_id: "card-token-abc",
      status: "authorized",
      back_url: "https://example.com/back",
      notification_url: "https://example.com/notify",
      reason: "A.3 | tokenizacion (mercadopagojs) | card | #0001",
      auto_recurring: {
        frequency: 1,
        frequency_type: "months",
        transaction_amount: 1000,
        currency_id: "ARS",
      },
    });
  });

  it("omits card_token_id/status and auto_recurring override when absent (minimal input)", () => {
    const input: SubscribeToPlanInput = {
      preapprovalPlanId: "plan-2",
      payerEmail: "payer2@example.com",
      externalReference: "ext-ref-2",
    };

    expect(buildSubscribeBody(input)).toEqual({
      preapproval_plan_id: "plan-2",
      payer_email: "payer2@example.com",
      external_reference: "ext-ref-2",
    });
  });
});
