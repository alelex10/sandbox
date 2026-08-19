// ---------------------------------------------------------------------------
// Preview-only defaults merge
// ---------------------------------------------------------------------------
//
// The preview endpoints MUST reuse the exact same zod request schemas the
// real create routes use (spec requirement), so a caller-supplied bad
// TYPE is rejected exactly like the real route would reject it. But they
// ALSO must accept a genuinely empty/partial body and still return 200
// with a fully-defaulted payload (spec requirement) — and several fields
// in those schemas are REQUIRED with no zod `.default()` (payerEmail,
// autoRecurring.frequency/amount, cardTokenId, tokenization, plan reason,
// preapprovalPlanId/externalReference for subscribe).
//
// These two requirements only coexist if we fill in harmless PREVIEW
// placeholder values for fields the caller left "empty" BEFORE calling
// `.parse()` — never overwriting a value the caller actually supplied,
// so a genuinely invalid caller-supplied value still fails the same
// schema exactly like it would on the real route.
//
// "Empty" here is broader than `undefined`: a pristine, never-touched
// frontend form renders required-but-blank fields as `""` (strings) or a
// coerced `0` (numbers coming from `Number("")`), and `null` for
// not-yet-tokenized card ids. Only exactly `0`/`NaN` are treated as
// "missing" for numeric fields — a genuinely invalid non-zero number (e.g.
// a caller-supplied `-5`) is left untouched so the same zod `.positive()`
// constraint still rejects it, exactly like the real route would.

type UnknownRecord = Record<string, unknown>;

function isRecord(v: unknown): v is UnknownRecord {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isMissing(v: unknown): boolean {
  if (v === undefined || v === null || v === "") return true;
  // Only `0`/`NaN` — the exact artifacts of `Number("")`/`Number(undefined)`
  // on an untouched form field. A genuinely invalid non-zero number (e.g.
  // a caller-supplied `-5`) must be left alone so the real zod schema still
  // rejects it, exactly like the real route would.
  if (typeof v === "number" && (Number.isNaN(v) || v === 0)) return true;
  return false;
}

/**
 * Fills keys in `raw` that are "missing" (see `isMissing`) with the
 * matching value from `overrides`, recursing one level into plain nested
 * objects (enough for `autoRecurring`). Never touches a key the caller
 * actually supplied with a meaningful value.
 */
function fillMissing(raw: unknown, overrides: UnknownRecord): UnknownRecord {
  const base: UnknownRecord = isRecord(raw) ? { ...raw } : {};
  for (const [key, value] of Object.entries(overrides)) {
    const current = base[key];
    if (isMissing(current)) {
      base[key] = value;
    } else if (isRecord(value) && isRecord(current)) {
      base[key] = fillMissing(current, value);
    }
  }
  return base;
}

const AUTO_RECURRING_PREVIEW_DEFAULTS: UnknownRecord = {
  frequency: 1,
  frequencyType: "months",
  amount: 1000,
  currency: "ARS",
};

export function withA1PreviewDefaults(raw: unknown): UnknownRecord {
  return fillMissing(raw, {
    payerEmail: "preview@example.com",
    autoRecurring: AUTO_RECURRING_PREVIEW_DEFAULTS,
  });
}

export function withA2PreviewDefaults(raw: unknown): UnknownRecord {
  return fillMissing(raw, {
    payerEmail: "preview@example.com",
    cardTokenId: "preview-placeholder-token",
    tokenization: "mercadopagojs",
    autoRecurring: AUTO_RECURRING_PREVIEW_DEFAULTS,
  });
}

export function withA3PlanPreviewDefaults(raw: unknown): UnknownRecord {
  return fillMissing(raw, {
    reason: "Preview plan",
    autoRecurring: AUTO_RECURRING_PREVIEW_DEFAULTS,
  });
}

export function withA3SubscribePreviewDefaults(raw: unknown): UnknownRecord {
  return fillMissing(raw, {
    preapprovalPlanId: "preview-plan-id",
    payerEmail: "preview@example.com",
    externalReference: "preview-external-reference",
  });
}
