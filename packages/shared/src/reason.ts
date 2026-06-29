// ---------------------------------------------------------------------------
// Default Subscription.reason composer
// ---------------------------------------------------------------------------
//
// Composes the default nomenclature for Subscription.reason from a typed
// input. Pure: no I/O, no Date.now(), no random, no env reads — deterministic
// from the input only.
//
// Format:
//
//     <type> | <channel>[ (<tokenization>)] | <paymentMethod> | #<seq>
//
// Examples:
//
//   buildDefaultReason({ type: "A.1", channel: "checkout_pro",
//                        paymentMethod: "pending", seq: "0001" })
//     → "A.1 | checkout_pro | pending | #0001"
//
//   buildDefaultReason({ type: "A.2", channel: "tokenizacion",
//                        tokenization: "mercadopagojs",
//                        paymentMethod: "card", seq: "0001" })
//     → "A.2 | tokenizacion (mercadopagojs) | card | #0001"
//
//   buildDefaultReason({ type: "A.3", channel: "checkout_pro",
//                        paymentMethod: "pending", seq: "0042" })
//     → "A.3 | checkout_pro | pending | #0042"
//
// Throws on invalid input — a mismatch between channel and tokenization is
// a programming error at the call site (the route derives the channel from
// the request shape, not from user input).
// ---------------------------------------------------------------------------

export type ReasonType = "A.1" | "A.2" | "A.3";
export type ReasonChannel = "checkout_pro" | "tokenizacion";
export type ReasonTokenization = "mercadopagojs" | "brick";
export type ReasonPaymentMethod = "card" | "mp_account" | "pending";

export interface DefaultReasonInput {
  type: ReasonType;
  channel: ReasonChannel;
  /** Required iff channel === "tokenizacion". */
  tokenization?: ReasonTokenization;
  paymentMethod: ReasonPaymentMethod;
  /** 4-digit zero-padded decimal string, e.g. "0001". */
  seq: string;
}

const SEQ_FORMAT = /^\d{4}$/;

export function buildDefaultReason(input: DefaultReasonInput): string {
  if (!SEQ_FORMAT.test(input.seq)) {
    throw new Error(
      `buildDefaultReason: invalid seq "${input.seq}" (expected 4 digits)`,
    );
  }
  if (input.channel === "tokenizacion" && input.tokenization === undefined) {
    throw new Error(
      "buildDefaultReason: channel is \"tokenizacion\" but tokenization is undefined",
    );
  }
  if (input.channel === "checkout_pro" && input.tokenization !== undefined) {
    throw new Error(
      "buildDefaultReason: channel is \"checkout_pro\" but tokenization was provided",
    );
  }
  const tokenSegment =
    input.channel === "tokenizacion" && input.tokenization !== undefined
      ? ` (${input.tokenization})`
      : "";
  return `${input.type} | ${input.channel}${tokenSegment} | ${input.paymentMethod} | #${input.seq}`;
}
