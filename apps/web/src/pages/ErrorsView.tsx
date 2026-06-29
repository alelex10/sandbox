import { useCallback, useState } from "react";
import { listErrors, clearErrors } from "../api.js";
import type { ApiErrorLogResponse } from "../api.js";
import { usePaginatedQuery } from "../hooks/usePaginatedQuery.js";
import { Pagination } from "../components/Pagination.js";

// ---------------------------------------------------------------------------
// Status badge — color-coded by HTTP status range
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: number }) {
  const cls =
    status >= 500
      ? "bg-red-100 text-red-700"
      : status >= 400
        ? "bg-yellow-100 text-yellow-700"
        : status >= 200 && status < 300
          ? "bg-green-100 text-green-700"
          : "bg-gray-100 text-gray-700";
  return (
    <span className={`text-xs rounded px-2 py-0.5 font-semibold ${cls}`}>
      {status}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Method badge — monospace uppercase
// ---------------------------------------------------------------------------

function MethodBadge({ method }: { method: string }) {
  return (
    <span className="text-xs rounded px-2 py-0.5 font-mono font-semibold bg-gray-100 text-gray-700 uppercase">
      {method}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Main ErrorsView component
// ---------------------------------------------------------------------------

export function ErrorsView() {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [refetchToken, setRefetchToken] = useState(0);
  // Path filter (URL-driven via search params would be ideal, but kept as
  // local state for now — PR5 scope keeps the public surface minimal).
  const [pathFilter, setPathFilter] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);

  const fetcher = useCallback(
    async (p: { page: number; limit: number }) => {
      void refetchToken;
      return listErrors({
        page: p.page,
        limit: p.limit,
        ...(pathFilter ? { path: pathFilter } : {}),
      });
    },
    [pathFilter, refetchToken],
  );

  const {
    data: rows,
    page,
    setPage,
    total,
    totalPages,
    limit,
    loading,
    error,
  } = usePaginatedQuery<ApiErrorLogResponse>({ fetcher, defaultLimit: 50 });

  function onClear() {
    if (!window.confirm("Delete all error logs? This cannot be undone.")) return;
    clearErrors()
      .then(() => {
        setActionError(null);
        setRefetchToken((n) => n + 1);
        setPage(1);
      })
      .catch((e: unknown) =>
        setActionError(e instanceof Error ? e.message : "Failed to clear error logs"),
      );
  }

  function onApplyFilter() {
    setActionError(null);
    setRefetchToken((n) => n + 1);
    setPage(1);
  }

  function toggleExpand(id: string) {
    setExpandedId((prev) => (prev === id ? null : id));
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h2 className="text-xl font-semibold text-gray-900">API Error Log</h2>
        <p className="text-sm text-gray-500">
          All errors that reached the global error handler, newest first.
        </p>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={pathFilter}
          onChange={(e) => setPathFilter(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onApplyFilter();
          }}
          placeholder="Filter by path (substring)…"
          className="flex-1 min-w-[12rem] border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          onClick={onApplyFilter}
          disabled={loading}
          className="px-4 py-2 text-sm font-medium rounded-md bg-gray-700 text-white hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Apply
        </button>
        <button
          onClick={() => {
            setRefetchToken((n) => n + 1);
            setPage(1);
          }}
          disabled={loading}
          className="px-4 py-2 text-sm font-medium rounded-md bg-gray-900 text-white hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? "Loading…" : "Refresh"}
        </button>
        <button
          onClick={onClear}
          disabled={loading || total === 0}
          className="px-4 py-2 text-sm font-medium rounded-md bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Clear all
        </button>
      </div>

      {/* Error state */}
      {(error || actionError) && (
        <p className="text-sm text-red-600">{actionError ?? error}</p>
      )}

      {/* Empty state */}
      {!loading && !error && rows.length === 0 && (
        <div className="rounded-lg border border-gray-200 bg-white px-6 py-10 text-center">
          <p className="text-sm text-gray-500">No error logs recorded yet.</p>
          <p className="text-xs text-gray-400 mt-1">
            Errors logged by the global handler will appear here.
          </p>
        </div>
      )}

      {/* Row list */}
      {!loading && rows.length > 0 && (
        <div className="rounded-lg border border-gray-200 bg-white divide-y divide-gray-100">
          {rows.map((row) => (
            <div key={row.id}>
              {/* Clickable summary row */}
              <button
                onClick={() => toggleExpand(row.id)}
                className="w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors flex flex-wrap items-center gap-2"
              >
                {/* Timestamp */}
                <span className="text-xs text-gray-400 shrink-0 tabular-nums">
                  {new Date(row.createdAt).toLocaleString()}
                </span>
                {/* Method */}
                <MethodBadge method={row.method} />
                {/* Path */}
                <span className="text-xs font-mono text-gray-700 break-all min-w-0 flex-1">
                  {row.path}
                </span>
                {/* Status */}
                <StatusBadge status={row.status} />
                {/* Message */}
                <span className="text-sm text-gray-800 truncate max-w-xs">
                  {row.message}
                </span>
                {/* Expand indicator */}
                <span className="text-xs text-gray-400 shrink-0 ml-auto">
                  {expandedId === row.id ? "▲" : "▼"}
                </span>
              </button>

              {/* Expanded detail */}
              {expandedId === row.id && (
                <div className="px-4 pb-3">
                  {row.detail !== null ? (
                    <pre className="overflow-x-auto rounded-md bg-gray-100 px-3 py-2 text-xs text-gray-700 whitespace-pre-wrap break-all">
                      {JSON.stringify(row.detail, null, 2)}
                    </pre>
                  ) : (
                    <p className="text-xs text-gray-400 italic">No detail</p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <Pagination
        page={page}
        totalPages={totalPages}
        total={total}
        limit={limit}
        onPageChange={setPage}
      />
    </div>
  );
}
