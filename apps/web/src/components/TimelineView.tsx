import { useState } from "react";
import type { TimelineEntryResponse } from "shared";
import { JsonViewer } from "./JsonViewer.js";

const TYPE_STYLES: Record<string, string> = {
  create: "bg-emerald-100 text-emerald-800",
  search: "bg-blue-100 text-blue-800",
  webhook: "bg-purple-100 text-purple-800",
  charge: "bg-orange-100 text-orange-800",
};

function formatAt(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: "short",
      timeStyle: "medium",
    });
  } catch {
    return iso;
  }
}

interface TimelineEntryProps {
  entry: TimelineEntryResponse;
  isLast: boolean;
}

function TimelineEntry({ entry, isLast }: TimelineEntryProps) {
  const [expanded, setExpanded] = useState(false);
  const badgeClass = TYPE_STYLES[entry.type] ?? "bg-gray-100 text-gray-700";
  const hasData = entry.data !== null && entry.data !== undefined;

  return (
    <li className="relative pl-6 pb-4">
      {/* Vertical connector — hidden for the last entry (M4) */}
      {!isLast && <span className="absolute left-1.5 top-2 bottom-0 w-px bg-gray-200" aria-hidden="true" />}
      {/* Dot */}
      <span className="absolute left-0 top-1.5 h-3 w-3 rounded-full border-2 border-white bg-gray-300" aria-hidden="true" />

      <div className="rounded border border-gray-200 bg-white shadow-sm px-3 py-2">
        <div className="flex flex-wrap items-center gap-2 mb-1">
          <span className={`text-xs font-semibold rounded px-1.5 py-0.5 ${badgeClass}`}>
            {entry.type}
          </span>
          <span className="text-sm font-medium text-gray-800">{entry.label}</span>
          {entry.status && (
            <span className="text-xs text-gray-500 bg-gray-100 rounded px-1.5 py-0.5">
              {entry.status}
            </span>
          )}
          <span className="ml-auto text-xs text-gray-400 whitespace-nowrap">
            {formatAt(entry.at)}
          </span>
        </div>

        {hasData && (
          <>
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="text-xs text-blue-600 hover:underline"
            >
              {expanded ? "Hide data" : "Show data"}
            </button>
            {expanded && (
              <div className="mt-2">
                <JsonViewer value={entry.data} collapsed={1} />
              </div>
            )}
          </>
        )}
      </div>
    </li>
  );
}

interface TimelineViewProps {
  entries: TimelineEntryResponse[];
  loading?: boolean;
}

export function TimelineView({ entries, loading = false }: TimelineViewProps) {
  if (loading) {
    return <p className="text-xs text-gray-400 italic">Loading timeline…</p>;
  }

  if (entries.length === 0) {
    return <p className="text-xs text-gray-400 italic">No timeline entries yet.</p>;
  }

  return (
    <ol className="space-y-0">
      {entries.map((entry, idx) => (
        <TimelineEntry key={entry.id} entry={entry} isLast={idx === entries.length - 1} />
      ))}
    </ol>
  );
}
