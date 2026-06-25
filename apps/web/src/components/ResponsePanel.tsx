const KEY_FIELDS = [
  "id",
  "status",
  "init_point",
  "payment_method_id",
  "card_id",
  "next_payment_date",
] as const;

interface ResponsePanelProps {
  data: unknown;
}

function extractKeyFields(data: unknown): Record<string, unknown> {
  if (data === null || typeof data !== "object") return {};
  const obj = data as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  for (const key of KEY_FIELDS) {
    if (obj[key] != null) {
      result[key] = obj[key];
    }
  }
  return result;
}

export function ResponsePanel({ data }: ResponsePanelProps) {
  if (data === null || data === undefined) return null;

  const keyFields = extractKeyFields(data);
  const hasKeyFields = Object.keys(keyFields).length > 0;

  return (
    <div className="mt-4 space-y-3">
      {hasKeyFields && (
        <div className="rounded border border-blue-200 bg-blue-50 p-3">
          <h3 className="text-sm font-semibold text-blue-800 mb-2">Key Fields</h3>
          <dl className="space-y-1">
            {Object.entries(keyFields).map(([k, v]) => (
              <div key={k} className="flex gap-2 text-sm">
                <dt className="font-medium text-blue-700 shrink-0">{k}:</dt>
                <dd className="text-blue-900 break-all">{String(v)}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      <div className="rounded border border-gray-200 bg-gray-900 p-3">
        <h3 className="text-xs font-semibold text-gray-400 mb-2 uppercase tracking-wide">
          Raw Response
        </h3>
        <pre className="text-xs text-green-400 overflow-auto max-h-96 whitespace-pre-wrap break-all">
          {JSON.stringify(data, null, 2)}
        </pre>
      </div>
    </div>
  );
}
