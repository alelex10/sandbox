import { describe, it, expect } from "vitest";
import {
  withA1PreviewDefaults,
  withA2PreviewDefaults,
  withA3PlanPreviewDefaults,
  withA3SubscribePreviewDefaults,
} from "./previewDefaults.js";

describe("withA1PreviewDefaults", () => {
  it("fills every required-but-missing field on a completely empty body", () => {
    const filled = withA1PreviewDefaults({});
    expect(filled.payerEmail).toBe("preview@example.com");
    expect(filled.autoRecurring).toEqual({
      frequency: 1,
      frequencyType: "months",
      amount: 1000,
      currency: "ARS",
    });
  });

  it("never overwrites a caller-supplied value, even an invalid one", () => {
    const filled = withA1PreviewDefaults({
      payerEmail: "real@example.com",
      autoRecurring: { amount: -5 },
    });
    expect(filled.payerEmail).toBe("real@example.com");
    // amount stays -5 (invalid) — the schema, not this helper, must reject it.
    expect((filled.autoRecurring as Record<string, unknown>).amount).toBe(-5);
    // frequency/frequencyType/currency are still absent -> still filled.
    expect((filled.autoRecurring as Record<string, unknown>).frequency).toBe(1);
  });

  it("treats an untouched-form's coerced 0 amount and empty payerEmail as missing", () => {
    const filled = withA1PreviewDefaults({
      payerEmail: "",
      autoRecurring: { frequency: 1, frequencyType: "months", amount: 0, currency: "ARS" },
    });
    expect(filled.payerEmail).toBe("preview@example.com");
    expect((filled.autoRecurring as Record<string, unknown>).amount).toBe(1000);
  });
});

describe("withA2PreviewDefaults", () => {
  it("fills cardTokenId/tokenization placeholders when the card was never tokenized", () => {
    const filled = withA2PreviewDefaults({ cardTokenId: null, tokenization: undefined });
    expect(filled.cardTokenId).toBe("preview-placeholder-token");
    expect(filled.tokenization).toBe("mercadopagojs");
  });
});

describe("withA3PlanPreviewDefaults", () => {
  it("fills reason and autoRecurring on an empty plan body", () => {
    const filled = withA3PlanPreviewDefaults({});
    expect(filled.reason).toBe("Preview plan");
    expect(filled.autoRecurring).toEqual({
      frequency: 1,
      frequencyType: "months",
      amount: 1000,
      currency: "ARS",
    });
  });
});

describe("withA3SubscribePreviewDefaults", () => {
  it("fills preapprovalPlanId/payerEmail/externalReference on an empty body", () => {
    const filled = withA3SubscribePreviewDefaults({});
    expect(filled.preapprovalPlanId).toBe("preview-plan-id");
    expect(filled.payerEmail).toBe("preview@example.com");
    expect(filled.externalReference).toBe("preview-external-reference");
  });
});
