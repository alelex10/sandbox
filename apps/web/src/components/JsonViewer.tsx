import JsonView from "@uiw/react-json-view";

interface JsonViewerProps {
  value: unknown;
  collapsed?: boolean | number;
}

/**
 * Thin wrapper around @uiw/react-json-view with project-wide defaults.
 * - collapsed=1 by default so root is expanded but nested objects start closed
 * - max-height scroll so large payloads don't blow the layout
 * - copy enabled, data type labels off to save horizontal space
 */
export function JsonViewer({ value, collapsed = 1 }: JsonViewerProps) {
  if (value === null || value === undefined) {
    return (
      <div className="rounded border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-400 italic">
        null
      </div>
    );
  }

  // @uiw/react-json-view requires an object or array at the root
  const safe: object =
    typeof value === "object" && value !== null
      ? (value as object)
      : { value };

  return (
    <div className="overflow-auto max-h-80 rounded border border-gray-200 bg-white p-2 text-xs">
      <JsonView
        value={safe}
        collapsed={collapsed}
        displayDataTypes={false}
        enableClipboard
        style={{ fontSize: "11px", fontFamily: "ui-monospace, monospace" }}
      />
    </div>
  );
}
