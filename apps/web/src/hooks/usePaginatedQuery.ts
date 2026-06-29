import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { PaginationEnvelope } from "shared";

interface UsePaginatedQueryOptions<T> {
  /**
   * Fetches one page. Receives the resolved, clamped `page` and `limit` —
   * callers do NOT need to clamp before passing through.
   */
  fetcher: (params: { page: number; limit: number }) => Promise<PaginationEnvelope<T>>;
  /**
   * Filter values that, when changed, should reset pagination to page 1.
   * The hook serializes with `JSON.stringify` to detect changes.
   */
  filterDeps?: unknown[];
  /**
   * Default `limit` when the URL has no `?limit` or `?limit` is invalid.
   * Also controls the upper cap: if `defaultLimit > 100`, the cap is 200
   * (matches the 200-cap endpoints like webhooks + errors).
   */
  defaultLimit?: number;
}

interface UsePaginatedQueryResult<T> {
  data: T[];
  page: number;
  setPage: (p: number) => void;
  total: number;
  totalPages: number;
  limit: number;
  loading: boolean;
  error: string | null;
}

const DEFAULT_LIMIT = 20;
const DEFAULT_MAX_LIMIT = 100;
const EXTENDED_MAX_LIMIT = 200;

function clampInt(raw: string | null, fallback: number, min: number): number {
  if (raw == null) return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < min) return fallback;
  return n;
}

function clampLimit(raw: string | null, defaultLimit: number): number {
  const cap = defaultLimit > DEFAULT_MAX_LIMIT ? EXTENDED_MAX_LIMIT : DEFAULT_MAX_LIMIT;
  const n = clampInt(raw, defaultLimit, 1);
  return Math.min(n, cap);
}

function clampPage(raw: string | null): number {
  return clampInt(raw, 1, 1);
}

export function usePaginatedQuery<T>({
  fetcher,
  filterDeps,
  defaultLimit = DEFAULT_LIMIT,
}: UsePaginatedQueryOptions<T>): UsePaginatedQueryResult<T> {
  const [searchParams, setSearchParams] = useSearchParams();

  const page = clampPage(searchParams.get("page"));
  const limit = clampLimit(searchParams.get("limit"), defaultLimit);

  const [data, setData] = useState<T[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Reset to page 1 when filterDeps change. We do this as an effect (not a
  // setState during render) to avoid React warnings about side effects in
  // render. The next fetch will then run with page=1.
  const filterDepsKey = filterDeps ? JSON.stringify(filterDeps) : null;
  useEffect(() => {
    if (filterDepsKey == null) return;
    if (page !== 1) {
      const next = new URLSearchParams(searchParams);
      next.set("page", "1");
      setSearchParams(next, { replace: true });
    }
    // We intentionally exclude `page` and `searchParams` from deps — we only
    // want this to fire when filterDeps change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterDepsKey]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetcher({ page, limit })
      .then((envelope) => {
        if (cancelled) return;
        setData(envelope.items);
        setTotal(envelope.total);
        setTotalPages(envelope.totalPages);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Request failed");
        setData([]);
        setTotal(0);
        setTotalPages(0);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [fetcher, page, limit]);

  const setPage = (next: number) => {
    const clamped = Math.max(1, next);
    const params = new URLSearchParams(searchParams);
    params.set("page", String(clamped));
    setSearchParams(params);
  };

  return { data, page, setPage, total, totalPages, limit, loading, error };
}
