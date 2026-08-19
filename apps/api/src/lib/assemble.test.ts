import { describe, it, expect } from "vitest";
import { assembleA1, assembleA2, assembleA3Plan, assembleA3Subscribe } from "./assemble.js";
import type {
  CreateA1Request,
  CreateA2Request,
  CreatePlanRequest,
  SubscribeToPlanRequest,
  FieldProvenance,
} from "shared";

const FIXED_NOW = new Date("2026-08-18T12:00:00.000Z");

function findProv(provenance: FieldProvenance[], path: string) {
  const entry = provenance.find((p) => p.path === path);
  if (!entry) throw new Error(`No provenance entry for path "${path}" (have: ${provenance.map((p) => p.path).join(", ")})`);
  return entry;
}

describe("assembleA1", () => {
  const emptyBody: CreateA1Request = {
    payerEmail: "",
    autoRecurring: { frequency: 1, frequencyType: "months", amount: 0, currency: "ARS" },
  };

  it("defaults reason from the sequence when no user reason is provided", () => {
    const { input, provenance } = assembleA1(emptyBody, {
      seq: "0007",
      seqVolatile: true,
      backUrl: "https://env.example.com/back",
      notificationUrl: "https://env.example.com/notify",
      genExternalRef: () => "generated-uuid",
      now: FIXED_NOW,
    });

    expect(input.reason).toBe("A.1 | checkout_pro | pending | #0007");
    const reasonProv = findProv(provenance, "reason");
    expect(reasonProv.source).toBe("sequence");
    expect(reasonProv.origin).toContain("a1_pending");
    expect(reasonProv.origin).toContain("next, may change");
    expect(reasonProv.volatile).toBe(true);
  });

  it("uses the user's reason verbatim when provided (still traceable to form)", () => {
    const { input, provenance } = assembleA1(
      { ...emptyBody, reason: "My custom reason" },
      {
        seq: "0007",
        seqVolatile: true,
        genExternalRef: () => "generated-uuid",
        now: FIXED_NOW,
      },
    );

    expect(input.reason).toBe("My custom reason");
    expect(findProv(provenance, "reason").source).toBe("form");
  });

  it("defaults back_url from server env (MP_BACK_URL) when the form has none", () => {
    const { input, provenance } = assembleA1(emptyBody, {
      seq: "0001",
      seqVolatile: true,
      backUrl: "https://env.example.com/back",
      genExternalRef: () => "generated-uuid",
      now: FIXED_NOW,
    });

    expect(input.backUrl).toBe("https://env.example.com/back");
    const prov = findProv(provenance, "back_url");
    expect(prov.source).toBe("server-env");
    expect(prov.origin).toContain("MP_BACK_URL");
  });

  it("prefers a form-provided backUrl over the env default", () => {
    const { input, provenance } = assembleA1(
      { ...emptyBody, backUrl: "https://form.example.com/back" },
      {
        seq: "0001",
        seqVolatile: true,
        backUrl: "https://env.example.com/back",
        genExternalRef: () => "generated-uuid",
        now: FIXED_NOW,
      },
    );

    expect(input.backUrl).toBe("https://form.example.com/back");
    expect(findProv(provenance, "back_url").source).toBe("form");
  });

  it("tags notification_url as always server-sourced from MP_NOTIFICATION_URL", () => {
    const { provenance } = assembleA1(emptyBody, {
      seq: "0001",
      seqVolatile: true,
      notificationUrl: "https://env.example.com/notify",
      genExternalRef: () => "generated-uuid",
      now: FIXED_NOW,
    });

    const prov = findProv(provenance, "notification_url");
    expect(prov.source).toBe("server-env");
    expect(prov.origin).toContain("MP_NOTIFICATION_URL");
  });

  it("defaults start_date to tomorrow (now + 24h) with the rule stated in provenance", () => {
    const { input, provenance } = assembleA1(emptyBody, {
      seq: "0001",
      seqVolatile: true,
      genExternalRef: () => "generated-uuid",
      now: FIXED_NOW,
    });

    expect(input.autoRecurring.startDate).toBe("2026-08-19T12:00:00.000Z");
    const prov = findProv(provenance, "auto_recurring.start_date");
    expect(prov.source).toBe("default");
    expect(prov.origin).toContain("startDate = tomorrow");
  });

  it("returns the fully-defaulted input+provenance for a completely empty form (no throw)", () => {
    const { input, provenance } = assembleA1(emptyBody, {
      seq: "0001",
      seqVolatile: true,
      genExternalRef: () => "generated-uuid",
      now: FIXED_NOW,
    });

    expect(input.reason.length).toBeGreaterThan(0);
    expect(input.externalReference).toBe("generated-uuid");
    expect(input.autoRecurring.startDate).toBeTruthy();
    // Every field the UI needs to explain has a provenance entry.
    for (const path of ["reason", "external_reference", "auto_recurring.start_date"]) {
      expect(() => findProv(provenance, path)).not.toThrow();
    }
  });
});

describe("assembleA2", () => {
  const baseBody: CreateA2Request = {
    payerEmail: "",
    cardTokenId: "should-be-ignored-in-preview",
    tokenization: "mercadopagojs",
    autoRecurring: { frequency: 1, frequencyType: "months", amount: 0, currency: "ARS" },
  };

  it("uses the real card_token_id when NOT in placeholder mode (real create path)", () => {
    const { input, provenance } = assembleA2(
      { ...baseBody, cardTokenId: "real-card-token" },
      { seq: "0001", seqVolatile: false, genExternalRef: () => "uuid", now: FIXED_NOW },
    );

    expect(input.cardTokenId).toBe("real-card-token");
    expect(findProv(provenance, "card_token_id").source).toBe("form");
  });

  it("forces a placeholder card_token_id and never tokenizes when cardTokenPlaceholder is set (preview path)", () => {
    const { input, provenance } = assembleA2(baseBody, {
      seq: "0001",
      seqVolatile: true,
      genExternalRef: () => "uuid",
      now: FIXED_NOW,
      cardTokenPlaceholder: true,
    });

    expect(input.cardTokenId).toBe("generated client-side at submit");
    const prov = findProv(provenance, "card_token_id");
    expect(prov.source).toBe("constant");
    expect(prov.volatile).toBe(true);
  });
});

describe("assembleA3Plan", () => {
  const emptyPlanBody: CreatePlanRequest = {
    reason: "",
    autoRecurring: { frequency: 1, frequencyType: "months", amount: 0, currency: "ARS" },
  };

  it("does not require a sequence counter (plans have no reason auto-fill)", () => {
    const { input } = assembleA3Plan(emptyPlanBody, {
      backUrl: "https://env.example.com/back",
    });
    expect(input.reason).toBe("");
  });

  it("defaults back_url from env when form has none", () => {
    const { input, provenance } = assembleA3Plan(emptyPlanBody, {
      backUrl: "https://env.example.com/back",
    });
    expect(input.backUrl).toBe("https://env.example.com/back");
    expect(findProv(provenance, "back_url").source).toBe("server-env");
  });
});

describe("assembleA3Subscribe", () => {
  const emptySubscribeBody: SubscribeToPlanRequest = {
    preapprovalPlanId: "",
    payerEmail: "",
    externalReference: "",
  };

  it("defaults reason from the a3_plan sequence when no user reason is provided", () => {
    const { input, provenance } = assembleA3Subscribe(emptySubscribeBody, {
      seq: "0003",
      seqVolatile: true,
      genExternalRef: () => "uuid",
      now: FIXED_NOW,
    });

    expect(input.reason).toBe("A.3 | checkout_pro | pending | #0003");
    expect(findProv(provenance, "reason").source).toBe("sequence");
  });
});
