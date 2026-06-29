/**
 * Presentational pagination control.
 *
 * URL-agnostic: this component just renders and calls `onPageChange`. The
 * URL sync is the job of `usePaginatedQuery`. New list views adopt
 * `usePaginatedQuery` + this control together; ad-hoc paging state is banned
 * (see spec: "Frontend Pagination").
 */
interface PaginationProps {
  page: number;
  totalPages: number;
  total: number;
  limit: number;
  onPageChange: (p: number) => void;
  /**
   * When provided, renders a "Show N per page" `<select>` that calls this
   * callback on change. When omitted, no selector is rendered (backward-
   * compatible for list views that don't want a per-list page-size picker).
   */
  onLimitChange?: (n: number) => void;
}

/**
 * Build the list of page numbers to render. Truncates to first 3 + ... + last 3
 * when `totalPages > 7`, with the current page always visible and at most 3
 * page numbers around it.
 */
function buildPageList(current: number, totalPages: number): (number | "ellipsis")[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  if (current <= 4) {
    return [1, 2, 3, 4, 5, "ellipsis", totalPages];
  }
  if (current >= totalPages - 3) {
    return [1, 2, "ellipsis", totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
  }
  return [1, 2, "ellipsis", current - 1, current, current + 1, "ellipsis", totalPages];
}

function pageButtonClass(isActive: boolean, isDisabled: boolean): string {
  const base =
    "min-w-[2.25rem] h-9 px-2 text-sm border transition-colors font-medium tabular-nums";
  if (isDisabled) {
    return `${base} border-gray-200 bg-white text-gray-300 cursor-not-allowed`;
  }
  if (isActive) {
    return `${base} border-blue-600 bg-blue-600 text-white`;
  }
  return `${base} border-gray-200 bg-white text-gray-700 hover:bg-gray-50 hover:border-gray-300`;
}

export function Pagination({ page, totalPages, total, limit, onPageChange, onLimitChange }: PaginationProps) {
  if (totalPages <= 1) return null;

  const pages = buildPageList(page, totalPages);
  const canPrev = page > 1;
  const canNext = page < totalPages;

  const go = (p: number) => {
    const clamped = Math.min(Math.max(1, p), totalPages);
    if (clamped !== page) onPageChange(clamped);
  };

  return (
    <nav
      aria-label="Pagination"
      className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 py-3"
    >
      <div className="flex items-center gap-3">
        <p className="text-xs text-gray-500 tabular-nums">
          Page <span className="font-medium text-gray-700">{page}</span> of{" "}
          <span className="font-medium text-gray-700">{totalPages}</span>
          <span className="text-gray-400"> ({total} total)</span>
        </p>
        {onLimitChange && (
          <select
            value={limit}
            onChange={(e) => onLimitChange(Number(e.target.value))}
            aria-label="Items per page"
            className="text-xs border border-gray-300 rounded px-2 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {[10, 20, 50, 100].map((n) => (
              <option key={n} value={n}>
                Show {n}/page
              </option>
            ))}
          </select>
        )}
      </div>

      <ul className="flex items-center gap-1">
        <li>
          <button
            type="button"
            onClick={() => go(page - 1)}
            disabled={!canPrev}
            aria-label="Previous page"
            className={pageButtonClass(false, !canPrev)}
          >
            ‹
          </button>
        </li>

        {pages.map((p, idx) =>
          p === "ellipsis" ? (
            <li
              key={`ellipsis-${idx}`}
              className="min-w-[2.25rem] h-9 flex items-center justify-center text-sm text-gray-400 select-none"
              aria-hidden="true"
            >
              …
            </li>
          ) : (
            <li key={p}>
              <button
                type="button"
                onClick={() => go(p)}
                aria-current={p === page ? "page" : undefined}
                aria-label={`Page ${p}`}
                className={pageButtonClass(p === page, false)}
              >
                {p}
              </button>
            </li>
          )
        )}

        <li>
          <button
            type="button"
            onClick={() => go(page + 1)}
            disabled={!canNext}
            aria-label="Next page"
            className={pageButtonClass(false, !canNext)}
          >
            ›
          </button>
        </li>
      </ul>
    </nav>
  );
}
