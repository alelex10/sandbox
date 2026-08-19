import { describe, it, expect } from "vitest";
import { buildA1Body, type CreateA1Input } from "./a1-pending.js";

// Approval test: locks in the EXACT snake_case MP request body `createA1`
// sends today, before extracting it into a standalone pure function. If a
// future refactor of `buildA1Body` changes the shape, this test fails —
// that is the point (behavior-preserving extraction guardrail).
describe("buildA1Body", () => {
  it("builds the full snake_case body for a fully-populated input", () => {
    const input: CreateA1Input = {
      reason: "A.1 | checkout_pro | pending | #0001",
      payerEmail: "payer@example.com",
      externalReference: "ext-ref-1",
      backUrl: "https://example.com/back",
      notificationUrl: "https://example.com/notify",
      autoRecurring: {
        frequency: 1,
        frequencyType: "months",
        amount: 1000,
        currency: "ARS",
        startDate: "2026-01-01T00:00:00.000Z",
        endDate: "2026-06-01T00:00:00.000Z",
        freeTrial: {
          frequency: 1,
          frequencyType: "months",
          firstInvoiceOffset: 0,
        },
        repetitions: 12,
      },
    };

    expect(buildA1Body(input)).toEqual({
      reason: "A.1 | checkout_pro | pending | #0001",
      payer_email: "payer@example.com",
      external_reference: "ext-ref-1",
      back_url: "https://example.com/back",
      notification_url: "https://example.com/notify",
      status: "pending",
      auto_recurring: {
        frequency: 1,
        frequency_type: "months",
        transaction_amount: 1000,
        currency_id: "ARS",
        start_date: "2026-01-01T00:00:00.000Z",
        end_date: "2026-06-01T00:00:00.000Z",
        free_trial: {
          frequency: 1,
          frequency_type: "months",
          first_invoice_offset: 0,
        },
        repetitions: 12,
      },
    });
  });

  it("omits optional fields entirely when absent (minimal input)", () => {
    const input: CreateA1Input = {
      reason: "A.1 | checkout_pro | pending | #0002",
      payerEmail: "payer2@example.com",
      externalReference: "ext-ref-2",
      autoRecurring: {
        frequency: 1,
        frequencyType: "days",
        amount: 500,
        currency: "ARS",
      },
    };

    expect(buildA1Body(input)).toEqual({
      reason: "A.1 | checkout_pro | pending | #0002",
      payer_email: "payer2@example.com",
      external_reference: "ext-ref-2",
      status: "pending",
      auto_recurring: {
        frequency: 1,
        frequency_type: "days",
        transaction_amount: 500,
        currency_id: "ARS",
        start_date: undefined,
      },
    });
  });
});
