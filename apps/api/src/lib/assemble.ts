// ---------------------------------------------------------------------------
// Pure per-flow body assemblers
// ---------------------------------------------------------------------------
//
// Each assembleX(body, deps) computes the SAME defaulting logic the real
// create route uses (effective reason, start_date default, back_url /
// notification_url resolution, external_reference generation) PLUS a
// per-field provenance trail — and returns both without any I/O.
//
// Deliberately pure: no DB access, no MP SDK calls, no `Date.now()` (the
// caller injects `now`), no direct `crypto.randomUUID()` (the caller
// injects `genExternalRef`). This is what lets the exact same function
// back both the real (mutating) create route AND the (read-only) preview
// route — the ONLY thing that differs between them is what `deps` the
// caller passes in (a real vs. peeked sequence, a real vs. placeholder
// card token generator).

import { buildDefaultReason } from "shared";
import type {
  CreateA1Request,
  CreateA2Request,
  CreatePlanRequest,
  SubscribeToPlanRequest,
  FieldProvenance,
} from "shared";
import type { CreateA1Input } from "payments";
import type { CreateA2Input } from "payments";
import type { CreatePlanInput, SubscribeToPlanInput } from "payments";

export interface AssembleResult<TInput> {
  input: TInput;
  provenance: FieldProvenance[];
}

/** Deps shared by every subscription-style flow (A1, A2, A3-subscribe). */
export interface SubscriptionAssembleDeps {
  /** Sequence string to use for the default reason (already peeked or already burned). */
  seq: string;
  /** True when `seq` came from a read-only peek (may change by submit time). */
  seqVolatile: boolean;
  backUrl?: string;
  notificationUrl?: string;
  /** Generates externalReference when the form doesn't supply one. */
  genExternalRef: () => string;
  /** Injected clock for deterministic tests; defaults to `new Date()`. */
  now?: Date;
}

function tomorrowIso(now: Date): string {
  return new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
}

// ---------------------------------------------------------------------------
// A.1 — Preapproval Pending
// ---------------------------------------------------------------------------

export function assembleA1(
  body: CreateA1Request,
  deps: SubscriptionAssembleDeps,
): AssembleResult<CreateA1Input> {
  const now = deps.now ?? new Date();
  const provenance: FieldProvenance[] = [];

  const externalReference = body.externalReference ?? deps.genExternalRef();
  provenance.push({
    path: "external_reference",
    source: body.externalReference ? "form" : "derived",
    origin: body.externalReference
      ? "form override"
      : "crypto.randomUUID() on submit",
    volatile: !body.externalReference,
  });

  const startDate = body.autoRecurring.startDate ?? tomorrowIso(now);
  provenance.push({
    path: "auto_recurring.start_date",
    source: body.autoRecurring.startDate ? "form" : "default",
    origin: body.autoRecurring.startDate
      ? "form override"
      : "startDate = tomorrow",
  });

  const userReason = body.reason?.trim() ?? "";
  const effectiveReason =
    userReason !== ""
      ? userReason
      : buildDefaultReason({
          type: "A.1",
          channel: "checkout_pro",
          paymentMethod: "pending",
          seq: deps.seq,
        });
  provenance.push({
    path: "reason",
    source: userReason !== "" ? "form" : "sequence",
    origin:
      userReason !== ""
        ? "form override"
        : "buildDefaultReason(...) seq from Counter 'a1_pending' (peek: next, may change)",
    volatile: userReason === "" && deps.seqVolatile,
  });

  const backUrl = body.backUrl ?? deps.backUrl;
  provenance.push({
    path: "back_url",
    source: body.backUrl ? "form" : "server-env",
    origin: body.backUrl ? "form override" : "env MP_BACK_URL",
  });

  provenance.push({
    path: "notification_url",
    source: "server-env",
    origin: "MP_NOTIFICATION_URL (always server)",
  });

  provenance.push({ path: "status", source: "constant", origin: '"pending" (fixed by this flow)' });
  provenance.push({ path: "payer_email", source: "form", origin: "form" });
  provenance.push({ path: "auto_recurring.transaction_amount", source: "form", origin: "form" });
  provenance.push({
    path: "auto_recurring.currency_id",
    source: body.autoRecurring.currency !== "ARS" ? "form" : "default",
    origin: body.autoRecurring.currency !== "ARS" ? "form" : 'zod default "ARS"',
  });

  return {
    input: {
      reason: effectiveReason,
      payerEmail: body.payerEmail,
      externalReference,
      backUrl,
      notificationUrl: deps.notificationUrl,
      autoRecurring: {
        frequency: body.autoRecurring.frequency,
        frequencyType: body.autoRecurring.frequencyType,
        amount: body.autoRecurring.amount,
        currency: body.autoRecurring.currency,
        startDate,
        ...(body.autoRecurring.endDate !== undefined
          ? { endDate: body.autoRecurring.endDate }
          : {}),
        ...(body.autoRecurring.freeTrial !== undefined
          ? { freeTrial: body.autoRecurring.freeTrial }
          : {}),
        ...(body.autoRecurring.repetitions !== undefined
          ? { repetitions: body.autoRecurring.repetitions }
          : {}),
      },
    },
    provenance,
  };
}

// ---------------------------------------------------------------------------
// A.2 — Preapproval Authorized
// ---------------------------------------------------------------------------

export interface A2AssembleDeps extends SubscriptionAssembleDeps {
  /**
   * When true, `card_token_id` is ALWAYS the fixed preview placeholder,
   * regardless of what `body.cardTokenId` contains — the preview route
   * must never depend on (or imply) a real tokenization call. Unset/false
   * for the real create route, which always has an already-tokenized id.
   */
  cardTokenPlaceholder?: boolean;
}

const CARD_TOKEN_PLACEHOLDER = "generated client-side at submit";

export function assembleA2(
  body: CreateA2Request,
  deps: A2AssembleDeps,
): AssembleResult<CreateA2Input> {
  const a1Like = assembleA1(body, deps);

  // Re-derive the A.2-specific reason (channel "tokenizacion" instead of
  // "checkout_pro") — everything else from assembleA1 (external_reference,
  // start_date, back_url, notification_url) applies unchanged to A.2.
  const provenance = a1Like.provenance.filter((p) => p.path !== "reason" && p.path !== "status");
  const userReason = body.reason?.trim() ?? "";
  const effectiveReason =
    userReason !== ""
      ? userReason
      : buildDefaultReason({
          type: "A.2",
          channel: "tokenizacion",
          tokenization: body.tokenization,
          paymentMethod: "card",
          seq: deps.seq,
        });
  provenance.unshift({
    path: "reason",
    source: userReason !== "" ? "form" : "sequence",
    origin:
      userReason !== ""
        ? "form override"
        : "buildDefaultReason(...) seq from Counter 'a2_authorized' (peek: next, may change)",
    volatile: userReason === "" && deps.seqVolatile,
  });
  provenance.push({ path: "status", source: "constant", origin: '"authorized" (fixed by this flow)' });

  const cardTokenId = deps.cardTokenPlaceholder ? CARD_TOKEN_PLACEHOLDER : body.cardTokenId;
  provenance.push({
    path: "card_token_id",
    source: deps.cardTokenPlaceholder ? "constant" : "form",
    origin: deps.cardTokenPlaceholder
      ? "generated client-side at submit — not tokenized in preview"
      : "form (already tokenized client-side before submit)",
    volatile: deps.cardTokenPlaceholder,
  });

  return {
    input: {
      reason: effectiveReason,
      payerEmail: a1Like.input.payerEmail,
      externalReference: a1Like.input.externalReference,
      backUrl: a1Like.input.backUrl,
      notificationUrl: a1Like.input.notificationUrl,
      cardTokenId,
      autoRecurring: a1Like.input.autoRecurring,
    },
    provenance,
  };
}

// ---------------------------------------------------------------------------
// A.3 — Plan (PreApprovalPlan template)
// ---------------------------------------------------------------------------

export interface PlanAssembleDeps {
  backUrl?: string;
}

export function assembleA3Plan(
  body: CreatePlanRequest,
  deps: PlanAssembleDeps,
): AssembleResult<CreatePlanInput> {
  const provenance: FieldProvenance[] = [];

  const backUrl = body.backUrl ?? deps.backUrl;
  provenance.push({
    path: "back_url",
    source: body.backUrl ? "form" : "server-env",
    origin: body.backUrl ? "form override" : "env MP_BACK_URL",
  });
  provenance.push({ path: "reason", source: "form", origin: "form" });
  provenance.push({ path: "auto_recurring.transaction_amount", source: "form", origin: "form" });
  provenance.push({
    path: "auto_recurring.currency_id",
    source: body.autoRecurring.currency !== "ARS" ? "form" : "default",
    origin: body.autoRecurring.currency !== "ARS" ? "form" : 'zod default "ARS"',
  });

  return {
    input: {
      reason: body.reason,
      backUrl,
      autoRecurring: {
        frequency: body.autoRecurring.frequency,
        frequencyType: body.autoRecurring.frequencyType,
        amount: body.autoRecurring.amount,
        currency: body.autoRecurring.currency,
        ...(body.billingDay !== undefined ? { billingDay: body.billingDay } : {}),
        ...(body.billingDayProportional !== undefined
          ? { billingDayProportional: body.billingDayProportional }
          : {}),
        ...(body.autoRecurring.endDate !== undefined
          ? { endDate: body.autoRecurring.endDate }
          : {}),
        ...(body.autoRecurring.freeTrial !== undefined
          ? { freeTrial: body.autoRecurring.freeTrial }
          : {}),
        ...(body.autoRecurring.repetitions !== undefined
          ? { repetitions: body.autoRecurring.repetitions }
          : {}),
      },
      ...(body.paymentMethodsAllowed !== undefined
        ? { paymentMethodsAllowed: body.paymentMethodsAllowed }
        : {}),
    },
    provenance,
  };
}

// ---------------------------------------------------------------------------
// A.3 — Subscribe (link a payer to an existing plan)
// ---------------------------------------------------------------------------

export function assembleA3Subscribe(
  body: SubscribeToPlanRequest,
  deps: SubscriptionAssembleDeps,
): AssembleResult<SubscribeToPlanInput> {
  const provenance: FieldProvenance[] = [];

  const userReason = body.reason?.trim() ?? "";
  const effectiveReason =
    userReason !== ""
      ? userReason
      : body.cardTokenId
        ? buildDefaultReason({
            type: "A.3",
            channel: "tokenizacion",
            tokenization: body.tokenization,
            paymentMethod: "card",
            seq: deps.seq,
          })
        : buildDefaultReason({
            type: "A.3",
            channel: "checkout_pro",
            paymentMethod: "pending",
            seq: deps.seq,
          });
  provenance.push({
    path: "reason",
    source: userReason !== "" ? "form" : "sequence",
    origin:
      userReason !== ""
        ? "form override"
        : "buildDefaultReason(...) seq from Counter 'a3_plan' (peek: next, may change)",
    volatile: userReason === "" && deps.seqVolatile,
  });

  const backUrl = body.backUrl ?? deps.backUrl;
  provenance.push({
    path: "back_url",
    source: body.backUrl ? "form" : "server-env",
    origin: body.backUrl ? "form override" : "env MP_BACK_URL",
  });
  provenance.push({
    path: "notification_url",
    source: "server-env",
    origin: "MP_NOTIFICATION_URL (always server)",
  });
  provenance.push({ path: "preapproval_plan_id", source: "form", origin: "form" });
  provenance.push({ path: "payer_email", source: "form", origin: "form" });
  provenance.push({ path: "external_reference", source: "form", origin: "form" });

  return {
    input: {
      preapprovalPlanId: body.preapprovalPlanId,
      payerEmail: body.payerEmail,
      externalReference: body.externalReference,
      backUrl,
      notificationUrl: deps.notificationUrl,
      reason: effectiveReason,
      ...(body.cardTokenId ? { cardTokenId: body.cardTokenId } : {}),
      ...(body.autoRecurring !== undefined ? { autoRecurring: body.autoRecurring } : {}),
    },
    provenance,
  };
}
