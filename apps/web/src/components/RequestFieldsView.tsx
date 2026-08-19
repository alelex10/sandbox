import { useEffect, useRef, useState } from "react";
import type { PreviewResponse, FieldProvenance } from "shared";
import { JsonViewer } from "./JsonViewer.js";

interface RequestFieldsViewProps {
  /** Card heading, e.g. "Solicitud MP". */
  title: string;
  /** Calls the non-mutating preview endpoint for the current flow. */
  fetchPreview: () => Promise<PreviewResponse>;
  /**
   * Dependency array: whenever any value changes, the preview re-fetches
   * (debounced). Pass `[]` for a standalone/non-live preview (fetched once
   * on mount) or the live form field values for a form-bound preview.
   */
  watch: unknown[];
  /** Debounce delay in ms before re-fetching after `watch` changes. */
  debounceMs?: number;
}

const SOURCE_LABEL: Record<FieldProvenance["source"], string> = {
  form: "Form",
  derived: "Derived",
  "server-env": "Server env",
  sequence: "Sequence",
  default: "Default",
  constant: "Constant",
};

/**
 * Debounced-fetch preview panel: renders the assembled request body
 * (JsonViewer) alongside a per-field provenance table. Used by the
 * "Solicitud MP" tab on A1/A2/A3 — see spec `mp-request-inline-view`.
 *
 * On first mount it fetches immediately regardless of `debounceMs` isn't
 * special-cased — the initial fetch is just the first debounced call, so
 * the "defaulted, not blank" requirement is satisfied by the effect
 * always running at least once per mount.
 */
export function RequestFieldsView({
  title,
  fetchPreview,
  watch,
  debounceMs = 300,
}: RequestFieldsViewProps) {
  const [data, setData] = useState<PreviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Guards against a slow, now-stale request overwriting a newer result.
  const requestIdRef = useRef(0);

  useEffect(() => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    const timer = setTimeout(() => {
      fetchPreview()
        .then((res) => {
          if (requestIdRef.current !== requestId) return;
          setData(res);
          setError(null);
        })
        .catch((err: unknown) => {
          if (requestIdRef.current !== requestId) return;
          setError(err instanceof Error ? err.message : "Preview failed");
        })
        .finally(() => {
          if (requestIdRef.current === requestId) setLoading(false);
        });
    }, debounceMs);
    return () => clearTimeout(timer);
    // `watch` is an intentionally caller-controlled dependency list — the
    // effect re-runs exactly when the caller's tracked values change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, watch);

  return (
    <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
      <div className="border-b border-gray-200 px-4 py-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
        {loading && <span className="text-xs text-gray-400">Actualizando…</span>}
      </div>
      <div className="p-4 space-y-4">
        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
            {error}
          </p>
        )}

        {data && (
          <>
            <JsonViewer value={data.body} collapsed={1} />

            <div>
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                Provenance
              </h4>
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-gray-400">
                    <th className="pb-1 pr-2 font-medium">Field</th>
                    <th className="pb-1 pr-2 font-medium">Source</th>
                    <th className="pb-1 font-medium">Origin</th>
                  </tr>
                </thead>
                <tbody>
                  {data.provenance.map((p) => (
                    <tr key={p.path} className="border-t border-gray-100 align-top">
                      <td className="py-1.5 pr-2 font-mono text-gray-700 whitespace-nowrap">
                        {p.path}
                      </td>
                      <td className="py-1.5 pr-2 text-gray-600 whitespace-nowrap">
                        {SOURCE_LABEL[p.source]}
                        {p.volatile && (
                          <span
                            className="ml-1 text-amber-600"
                            title="May change by the time you actually submit"
                          >
                            *
                          </span>
                        )}
                      </td>
                      <td className="py-1.5 text-gray-500">{p.origin}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {!data && !loading && !error && (
          <p className="text-sm text-gray-400 italic">No preview yet.</p>
        )}
      </div>
    </div>
  );
}
