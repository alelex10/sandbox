import { useState, useCallback } from "react";
import type { SubscriptionMethod, WebhookEventResponse } from "shared";
import { listWebhooks, deleteWebhook, clearWebhooks } from "../api.js";
import { JsonViewer } from "./JsonViewer.js";
import { Pagination } from "./Pagination.js";
import { usePaginatedQuery } from "../hooks/usePaginatedQuery.js";
import { useSetting } from "../hooks/useSettings.js";

interface WebhookListProps {
  method: SubscriptionMethod;
  /** When set, only events attributed to this local subscription id are shown. */
  subscriptionId?: string;
  /** When set, only events attributed to any subscription of this plan are shown. */
  planId?: string;
}

export function WebhookList({
  method,
  subscriptionId,
  planId,
}: WebhookListProps) {
  // Unclassified (no method) events can never be linked to a specific
  // subscription/plan, so we only fetch them when no scope filter is active.
  const scoped = Boolean(subscriptionId || planId);

  // The user-controlled page-size setting. The "Show N per page" select in
  // `<Pagination>` writes back through this setter.
  const [, setDefaultLimit] = useSetting<number>("pagination.defaultLimit");

  // Bumping this refetchToken re-runs the usePaginatedQuery fetcher (which
  // depends on it via the wrapper). Used after mutating deletes/clear.
  const [refetchToken, setRefetchToken] = useState(0);

  // Scoped fetcher: filtered by method + subscriptionId (or planId).
  const scopedFetcher = useCallback(
    async (p: { page: number; limit: number }) => {
      const opts: { subscriptionId?: string; planId?: string; page?: number; limit?: number } = {
        page: p.page,
        limit: p.limit,
      };
      if (subscriptionId) opts.subscriptionId = subscriptionId;
      else if (planId) opts.planId = planId;
      // depend on refetchToken so the hook re-runs after mutations
      void refetchToken;
      return listWebhooks(method, opts);
    },
    [method, subscriptionId, planId, refetchToken],
  );

  const scopedQuery = usePaginatedQuery<WebhookEventResponse>({
    fetcher: scopedFetcher,
  });

  // Unattributed fetcher: only when not scoped (per the comment above).
  // We always declare the hook to keep hook order stable; when scoped, the
  // result is ignored.
  const unattributedFetcher = useCallback(
    async (p: { page: number; limit: number }) => {
      void refetchToken;
      return listWebhooks("unattributed", { page: p.page, limit: p.limit });
    },
    [refetchToken],
  );

  const unattributedQuery = usePaginatedQuery<WebhookEventResponse>({
    fetcher: unattributedFetcher,
  });

  const attributed = scopedQuery.data.filter((e) => e.method !== null);
  const unclassified = scoped ? [] : unattributedQuery.data;
  const totalCount = attributed.length + unclassified.length;
  const error = scopedQuery.error ?? (scoped ? null : unattributedQuery.error);

  const handleClearAll = async () => {
    if (!window.confirm("Delete all webhook events? This cannot be undone.")) return;
    try {
      await clearWebhooks();
      setRefetchToken((n) => n + 1);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Failed to clear webhooks");
    }
  };

  const handleDeleteOne = async (_id: string) => {
    try {
      await deleteWebhook(_id);
      setRefetchToken((n) => n + 1);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Failed to delete webhook");
    }
  };

  return (
    <div className="mt-2">
      {totalCount > 0 && (
        <div className="flex justify-end mb-2">
          <button
            type="button"
            onClick={handleClearAll}
            className="text-xs text-red-500 hover:text-red-700 hover:underline font-sans"
          >
            Eliminar todo
          </button>
        </div>
      )}

      {error && (
        <p className="text-sm text-red-600 mb-2">{error}</p>
      )}

      {scoped && scopedQuery.data.length === 0 && !error && !scopedQuery.loading && (
        <p className="text-sm text-gray-400">
          No events yet for this {subscriptionId ? "subscription" : "plan"}.
        </p>
      )}

      {attributed.length > 0 && (
        <div className="mb-4">
          <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
            Attributed ({scopedQuery.total} total)
          </h4>
          <EventList events={attributed} onDelete={handleDeleteOne} />
          <Pagination
            page={scopedQuery.page}
            totalPages={scopedQuery.totalPages}
            total={scopedQuery.total}
            limit={scopedQuery.limit}
            onPageChange={scopedQuery.setPage}
            onLimitChange={setDefaultLimit}
          />
        </div>
      )}

      {!scoped && unclassified.length > 0 && (
        <div>
          <h4 className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">
            Unclassified ({unattributedQuery.total} total)
          </h4>
          <EventList events={unclassified} muted onDelete={handleDeleteOne} />
          <Pagination
            page={unattributedQuery.page}
            totalPages={unattributedQuery.totalPages}
            total={unattributedQuery.total}
            limit={unattributedQuery.limit}
            onPageChange={unattributedQuery.setPage}
            onLimitChange={setDefaultLimit}
          />
        </div>
      )}

      {!scoped && scopedQuery.data.length === 0 && unattributedQuery.data.length === 0 && !error && !scopedQuery.loading && !unattributedQuery.loading && (
        <p className="text-sm text-gray-400">No events yet.</p>
      )}
    </div>
  );
}

function EventList({
  events,
  muted = false,
  onDelete,
}: {
  events: WebhookEventResponse[];
  muted?: boolean;
  onDelete: (id: string) => void;
}) {
  return (
    <ul className="space-y-2">
      {events.map((ev) => (
        <EventItem key={ev.id} ev={ev} muted={muted} onDelete={onDelete} />
      ))}
    </ul>
  );
}

function EventItem({ ev, muted, onDelete }: { ev: WebhookEventResponse; muted: boolean; onDelete: (id: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const hasPayload = ev.rawBody !== null && ev.rawBody !== undefined;
  const hasFetched = ev.rawFetched !== null && ev.rawFetched !== undefined;

  return (
    <li
      className={[
        "rounded border p-3 text-xs font-mono",
        muted
          ? "border-gray-200 bg-gray-50 text-gray-500"
          : "border-gray-200 bg-white text-gray-800",
      ].join(" ")}
    >
      <div className="flex gap-2 flex-wrap">
        <span className="rounded bg-gray-100 px-1.5 py-0.5">{ev.topic}</span>
        <span className="rounded bg-blue-100 text-blue-700 px-1.5 py-0.5">
          {ev.category}
        </span>
        {ev.method && (
          <span className="rounded bg-green-100 text-green-700 px-1.5 py-0.5">
            {ev.method}
          </span>
        )}
        {ev.action && (
          <span className="rounded bg-yellow-100 text-yellow-700 px-1.5 py-0.5">
            {ev.action}
          </span>
        )}
        <span className="ml-auto flex items-center gap-2">
          <span className="text-gray-400">
            {new Date(ev.receivedAt).toLocaleTimeString()}
          </span>
          <button
            type="button"
            title="Delete event"
            onClick={() => onDelete(ev.id)}
            className="text-gray-300 hover:text-red-500 transition-colors"
          >
            🗑
          </button>
        </span>
      </div>
      {ev.mpResourceId && (
        <div className="mt-1 text-gray-500">resource: {ev.mpResourceId}</div>
      )}
      {(hasPayload || hasFetched) && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-1 text-blue-500 hover:underline text-xs font-sans"
        >
          {expanded ? "Hide payload" : "Show payload"}
        </button>
      )}
      {expanded && (
        <div className="mt-2 space-y-2 font-sans">
          {hasPayload && (
            <div>
              <p className="text-xs text-gray-500 mb-1 font-medium">Body</p>
              <JsonViewer value={ev.rawBody} collapsed={1} />
            </div>
          )}
          {hasFetched && (
            <div>
              <p className="text-xs text-gray-500 mb-1 font-medium">Fetched</p>
              <JsonViewer value={ev.rawFetched} collapsed={1} />
            </div>
          )}
        </div>
      )}
    </li>
  );
}
