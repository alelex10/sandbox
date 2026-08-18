import { useCallback, useState } from "react";
import type { WebhookEventResponse } from "shared";
import { listWebhooks } from "../api.js";
import { usePaginatedQuery } from "../hooks/usePaginatedQuery.js";
import { Pagination } from "../components/Pagination.js";
import { JsonViewer } from "../components/JsonViewer.js";
import { useSetting } from "../hooks/useSettings.js";

// ---------------------------------------------------------------------------
// Attribution badge — derived from `subscriptionId`, NOT `method`. `method`
// is topic-derived at ingest and proves nothing about linkage; `subscriptionId`
// is only set when enrichment matched `external_reference` to a local
// subscription (see design: "attribution derived from subscriptionId").
// ---------------------------------------------------------------------------

function AttributionBadge({ subscriptionId }: { subscriptionId: string | null }) {
  return subscriptionId !== null ? (
    <span className="text-xs rounded px-2 py-0.5 font-semibold bg-green-100 text-green-700">
      Atribuido
    </span>
  ) : (
    <span className="text-xs rounded px-2 py-0.5 font-semibold bg-gray-100 text-gray-600">
      Huérfano
    </span>
  );
}

// ---------------------------------------------------------------------------
// Event row — clickable summary + expandable raw payload. Expansion only;
// no mutation callback exists (this page is read-only, see spec).
// ---------------------------------------------------------------------------

interface EventRowProps {
  ev: WebhookEventResponse;
  expanded: boolean;
  onToggle: (id: string) => void;
}

function EventRow({ ev, expanded, onToggle }: EventRowProps) {
  return (
    <div>
      {/* Clickable summary row */}
      <button
        onClick={() => onToggle(ev.id)}
        className="w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors flex flex-wrap items-center gap-2"
      >
        {/* Timestamp */}
        <span className="text-xs text-gray-400 shrink-0 tabular-nums">
          {new Date(ev.receivedAt).toLocaleString()}
        </span>
        {/* Topic */}
        <span className="text-xs rounded px-1.5 py-0.5 bg-gray-100 text-gray-700">
          {ev.topic}
        </span>
        {/* Category */}
        <span className="text-xs rounded px-1.5 py-0.5 bg-blue-100 text-blue-700">
          {ev.category}
        </span>
        {/* Action */}
        <span className="text-xs font-mono text-gray-600">{ev.action ?? "—"}</span>
        {/* Resource id */}
        <span className="text-xs font-mono text-gray-500 truncate max-w-xs">
          {ev.mpResourceId ?? "—"}
        </span>
        {/* Attribution */}
        <AttributionBadge subscriptionId={ev.subscriptionId} />
        {/* Expand indicator */}
        <span className="text-xs text-gray-400 shrink-0 ml-auto">
          {expanded ? "▲" : "▼"}
        </span>
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="px-4 pb-3 space-y-2">
          <div>
            <p className="text-xs text-gray-500 mb-1 font-medium">Body</p>
            <JsonViewer value={ev.rawBody} />
          </div>
          {ev.rawFetched !== null && (
            <div>
              <p className="text-xs text-gray-500 mb-1 font-medium">Fetched</p>
              <JsonViewer value={ev.rawFetched} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main NotificationsInbox component
// ---------------------------------------------------------------------------

export function NotificationsInbox() {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  // No mutation exists on this read-only page, so this token never changes —
  // kept only to follow the shared fetcher idiom (ErrorsView.tsx:53).
  const [refetchToken] = useState(0);
  const [, setDefaultLimit] = useSetting<number>("pagination.defaultLimit");

  const fetcher = useCallback(
    async (p: { page: number; limit: number }) => {
      void refetchToken;
      // Unfiltered: every topic/category, including "unknown", must appear.
      return listWebhooks(undefined, { page: p.page, limit: p.limit });
    },
    [refetchToken],
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
  } = usePaginatedQuery<WebhookEventResponse>({ fetcher });

  function toggleExpand(id: string) {
    setExpandedId((prev) => (prev === id ? null : id));
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h2 className="text-xl font-semibold text-gray-900">Notificaciones</h2>
        <p className="text-sm text-gray-500">
          Todos los eventos de webhook recibidos, de cualquier tipo, más recientes primero.
        </p>
      </div>

      {/* Loading state (pre-first-resolve) */}
      {loading && rows.length === 0 && (
        <p className="text-sm text-gray-400">Cargando…</p>
      )}

      {/* Error state */}
      {error && <p className="text-sm text-red-600">{error}</p>}

      {/* Empty state — an empty inbox is ambiguous between "nothing configured"
          and "nothing arrived yet", so the copy must never claim the former. */}
      {!loading && !error && rows.length === 0 && (
        <div className="rounded-lg border border-gray-200 bg-white px-6 py-10 text-center">
          <p className="text-sm text-gray-500">Todavía no llegó ningún evento.</p>
          <p className="text-xs text-gray-400 mt-1">
            Los eventos de webhook que reciba el servidor van a aparecer acá.
          </p>
        </div>
      )}

      {/* Row list */}
      {!loading && rows.length > 0 && (
        <div className="rounded-lg border border-gray-200 bg-white divide-y divide-gray-100">
          {rows.map((ev) => (
            <EventRow
              key={ev.id}
              ev={ev}
              expanded={expandedId === ev.id}
              onToggle={toggleExpand}
            />
          ))}
        </div>
      )}

      <Pagination
        page={page}
        totalPages={totalPages}
        total={total}
        limit={limit}
        onPageChange={setPage}
        onLimitChange={setDefaultLimit}
      />
    </div>
  );
}
