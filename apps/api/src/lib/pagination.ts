import type { PaginationEnvelope } from "shared";

// ---------------------------------------------------------------------------
// parsePagination
// ---------------------------------------------------------------------------
// Reads `?page` and `?limit` off an Express query bag, coerces + clamps
// them to safe values, and returns a Prisma-ready `{ skip, take }` shape.
//
// Behaviour (per spec scenario):
//   * missing            -> defaults (page=1, limit=20)
//   * non-numeric        -> defaults (e.g. `?page=abc`)
//   * non-integer        -> truncated (e.g. `?page=1.7` -> 1)
//   * out-of-range       -> clamped (e.g. `?page=0` -> 1, `?limit=500` -> 100)
//
// Each field is parsed + clamped INDEPENDENTLY so a single bad value on one
// field doesn't reset the other (e.g. `?page=0&limit=500` clamps BOTH, not
// resets both to defaults). The Zod schema `PaginationQuery` is kept in
// `packages/shared` for type inference / frontend validation, but the
// runtime work here is plain coercion + clamping to keep the spec's
// clamping contract.
// ---------------------------------------------------------------------------

export const DEFAULT_PAGE = 1;
export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 100;

function clampInt(
  value: unknown,
  min: number,
  max: number,
  fallback: number,
): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  const i = Math.trunc(n);
  if (i < min) return min;
  if (i > max) return max;
  return i;
}

export interface ParsedPagination {
  page: number;
  limit: number;
  offset: number;
  take: number;
}

export interface ParsePaginationOptions {
  /** Upper bound for `?limit`; defaults to MAX_LIMIT (100). */
  maxLimit?: number;
  /** Fallback for `?limit` when missing or non-numeric; defaults to DEFAULT_LIMIT (20). */
  defaultLimit?: number;
}

export function parsePagination(
  q: Record<string, unknown>,
  opts: ParsePaginationOptions = {},
): ParsedPagination {
  const maxLimit = opts.maxLimit ?? MAX_LIMIT;
  const defaultLimit = opts.defaultLimit ?? DEFAULT_LIMIT;
  const page = clampInt(q.page, 1, Number.MAX_SAFE_INTEGER, DEFAULT_PAGE);
  const limit = clampInt(q.limit, 1, maxLimit, defaultLimit);
  return { page, limit, offset: (page - 1) * limit, take: limit };
}

// ---------------------------------------------------------------------------
// paginationEnvelope
// ---------------------------------------------------------------------------
// Build the wire envelope from already-fetched `items` + a `total` count.
// `totalPages` is at least 1 so the UI never has to special-case empty
// pages (matches the spec's envelope shape and the design's
// `Math.max(1, Math.ceil(total / limit))`).
// ---------------------------------------------------------------------------

export function paginationEnvelope<T>(
  items: T[],
  total: number,
  page: number,
  limit: number,
): PaginationEnvelope<T> {
  return {
    items,
    total,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  };
}

// ---------------------------------------------------------------------------
// paginate
// ---------------------------------------------------------------------------
// One-call pagination for Prisma delegates. Runs `findMany` + `count` in
// parallel. `args.where` is forwarded to both; `args.orderBy` is forwarded
// only to `findMany` (count doesn't accept it).
//
// T is inferred from the delegate's `findMany` return type. The caller is
// responsible for mapping the Prisma rows to their wire shape (`map(...)`
// at the route level) before returning the envelope to the client.
// ---------------------------------------------------------------------------

export interface PaginateDelegate<T> {
  findMany: (args: any) => Promise<T[]>;
  count: (args: any) => Promise<number>;
}

export interface PaginateArgs {
  where?: unknown;
  orderBy?: unknown;
}

export async function paginate<T>(
  delegate: PaginateDelegate<T>,
  args: PaginateArgs,
  p: { page: number; limit: number },
): Promise<PaginationEnvelope<T>> {
  const offset = (p.page - 1) * p.limit;
  const [items, total] = await Promise.all([
    delegate.findMany({ ...args, skip: offset, take: p.limit }),
    delegate.count({ where: args.where }),
  ]);
  return paginationEnvelope(items, total, p.page, p.limit);
}
