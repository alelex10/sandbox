/** Shared status badge used across all subscription pages. */
export function StatusBadge({ status }: { status: string | null }) {
  const s = status ?? "unknown";
  const cls =
    s === "authorized" || s === "active"
      ? "bg-green-100 text-green-700"
      : s === "pending"
        ? "bg-yellow-100 text-yellow-700"
        : s === "pending_redirect"
          ? "bg-blue-100 text-blue-700"
          : s === "cancelled"
            ? "bg-red-100 text-red-700"
            : "bg-gray-100 text-gray-600";
  return (
    <span className={`text-xs rounded px-1.5 py-0.5 font-medium ${cls}`}>{s}</span>
  );
}
