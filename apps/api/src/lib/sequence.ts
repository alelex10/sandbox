// ---------------------------------------------------------------------------
// Per-method sequence counter (default Subscription.reason nomenclature)
// ---------------------------------------------------------------------------
//
// getNextSequence(method) atomically increments the Counter row for `method`
// and returns the new value formatted as a 4-digit zero-padded string
// (e.g. "0001", "0042"). The Counter row is created lazily on first use via
// the upsert — no manual seed step required.
//
// Gap trade-off (deliberate, see spec): this function runs BEFORE the MP
// SDK call so the seq is known when composing the default reason. If the
// MP call or the subsequent Subscription.create fails, the seq is already
// burned — the next call returns N+1, not N. Accepted for the sandbox.
//
// The `tx` parameter is accepted for future-proofing (so the increment
// could one day run inside the same $transaction as the Subscription.create),
// but no caller passes it today — the seq is always needed before MP.

import type { Prisma, PrismaClient } from "@prisma/client";
import { db } from "../db.js";

export type CounterMethod = "a1_pending" | "a2_authorized" | "a3_plan";

const VALID_METHODS: readonly CounterMethod[] = [
  "a1_pending",
  "a2_authorized",
  "a3_plan",
];

export async function getNextSequence(
  method: CounterMethod,
  tx?: Prisma.TransactionClient,
): Promise<string> {
  if (!VALID_METHODS.includes(method)) {
    throw new Error(`getNextSequence: unknown method "${method}"`);
  }
  // Two modes:
  //   - If a transaction client is provided, run inside it (no nested
  //     $transaction — TransactionClient cannot open its own).
  //   - If not, open a fresh $transaction on the singleton client so the
  //     upsert + increment are atomic on their own.
  if (tx) {
    await tx.counter.upsert({
      where: { name: method },
      create: { name: method, value: 0 },
      update: {},
    });
    const { value } = await tx.counter.update({
      where: { name: method },
      data: { value: { increment: 1 } },
    });
    return String(value % 10000).padStart(4, "0");
  }
  return db.$transaction(async (inner) => {
    await inner.counter.upsert({
      where: { name: method },
      create: { name: method, value: 0 },
      update: {},
    });
    const { value } = await inner.counter.update({
      where: { name: method },
      data: { value: { increment: 1 } },
    });
    return String(value % 10000).padStart(4, "0");
  });
}

// ---------------------------------------------------------------------------
// peekNextSequence — read-only preview of what getNextSequence would return
// ---------------------------------------------------------------------------
//
// Used ONLY by preview (dry-run) endpoints. Structurally guarantees no
// mutation: `findUnique` only, never `upsert`/`update`/`$transaction`. The
// Counter row is NOT created lazily here (unlike getNextSequence) — a
// missing row simply peeks as `current: 0`. Calling this any number of
// times with no intervening `getNextSequence` call always returns the same
// `next` value, because nothing is written.

export interface PeekedSequence {
  /** 4-digit zero-padded decimal string this call WOULD burn, e.g. "0042". */
  next: string;
  /** Current (already-persisted) Counter value, 0 when the row doesn't exist yet. */
  current: number;
  /** Always true — the caller must treat `next` as provisional (may change by submit time). */
  volatile: true;
}

export async function peekNextSequence(
  method: CounterMethod,
): Promise<PeekedSequence> {
  if (!VALID_METHODS.includes(method)) {
    throw new Error(`peekNextSequence: unknown method "${method}"`);
  }
  const row = await db.counter.findUnique({ where: { name: method } });
  const current = row?.value ?? 0;
  const next = String((current + 1) % 10000).padStart(4, "0");
  return { next, current, volatile: true };
}
