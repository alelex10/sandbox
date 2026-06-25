import { JsonViewer } from "./JsonViewer.js";

/**
 * Each entry is [displayLabel, ...candidateKeys].
 * The first candidate key that is non-null in the object wins.
 * This handles both snake_case (MP search result) and camelCase (SubscriptionResponse).
 */
const KEY_FIELD_CANDIDATES: [string, ...string[]][] = [
  ["id", "id"],
  ["status", "status"],
  ["init_point", "init_point", "initPoint"],
  ["payment_method_id", "payment_method_id", "paymentMethodId"],
  ["card_id", "card_id", "cardId"],
  ["next_payment_date", "next_payment_date", "nextPaymentDate"],
];

interface ResponsePanelProps {
  data: unknown;
}

function extractKeyFields(data: unknown): Record<string, unknown> {
  if (data === null || typeof data !== "object") return {};
  const obj = data as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  for (const [label, ...candidates] of KEY_FIELD_CANDIDATES) {
    for (const key of candidates) {
      if (obj[key] != null) {
        result[label] = obj[key];
        break;
      }
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

      <div className="rounded border border-gray-200 bg-gray-50 p-3">
        <h3 className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">
          Raw Response
        </h3>
        <JsonViewer value={data} collapsed={1} />
      </div>
    </div>
  );
}
