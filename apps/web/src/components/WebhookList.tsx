import { useEffect, useState, useCallback } from "react";
import type { SubscriptionMethod, WebhookEventResponse } from "shared";
import { listWebhooks } from "../api.js";

interface WebhookListProps {
  method: SubscriptionMethod;
  pollIntervalMs?: number;
}

export function WebhookList({ method, pollIntervalMs = 5000 }: WebhookListProps) {
  const [events, setEvents] = useState<WebhookEventResponse[]>([]);
  const [error, setError] = useState<string | null>(null);

  const fetchEvents = useCallback(async () => {
    try {
      const data = await listWebhooks(method);
      setEvents(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch webhooks");
    }
  }, [method]);

  useEffect(() => {
    fetchEvents();
    const timer = setInterval(fetchEvents, pollIntervalMs);
    return () => clearInterval(timer);
  }, [fetchEvents, pollIntervalMs]);

  const attributed = events.filter((e) => e.method !== null);
  const unclassified = events.filter((e) => e.method === null);

  return (
    <div className="mt-6">
      <h3 className="text-sm font-semibold text-gray-700 mb-3">
        Webhook Events{" "}
        <span className="text-gray-400 font-normal">(polling every {pollIntervalMs / 1000}s)</span>
      </h3>

      {error && (
        <p className="text-sm text-red-600 mb-2">{error}</p>
      )}

      {attributed.length > 0 && (
        <div className="mb-4">
          <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
            Attributed ({attributed.length})
          </h4>
          <EventList events={attributed} />
        </div>
      )}

      {unclassified.length > 0 && (
        <div>
          <h4 className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">
            Unclassified ({unclassified.length})
          </h4>
          <EventList events={unclassified} muted />
        </div>
      )}

      {events.length === 0 && !error && (
        <p className="text-sm text-gray-400">No events yet.</p>
      )}
    </div>
  );
}

function EventList({
  events,
  muted = false,
}: {
  events: WebhookEventResponse[];
  muted?: boolean;
}) {
  return (
    <ul className="space-y-2">
      {events.map((ev) => (
        <li
          key={ev.id}
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
            <span className="ml-auto text-gray-400">
              {new Date(ev.receivedAt).toLocaleTimeString()}
            </span>
          </div>
          {ev.mpResourceId && (
            <div className="mt-1 text-gray-500">resource: {ev.mpResourceId}</div>
          )}
        </li>
      ))}
    </ul>
  );
}
