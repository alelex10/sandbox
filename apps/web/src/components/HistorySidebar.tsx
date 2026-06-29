import type { ReactNode } from "react";

interface HistorySidebarProps<T> {
  title: string;
  items: T[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  renderItem: (item: T) => ReactNode;
  getId: (item: T) => string;
  onDelete?: (id: string) => void;
  onClearAll?: () => void;
  emptyMessage?: string;
}

/**
 * Generic sidebar with: title (including count), optional clear-all button,
 * scrollable list, selected-item highlight, optional per-item delete button.
 *
 * The per-item delete button stops click propagation internally so callers
 * do not need to manage `e.stopPropagation()` themselves.
 */
export function HistorySidebar<T>({
  title,
  items,
  selectedId,
  onSelect,
  renderItem,
  getId,
  onDelete,
  onClearAll,
  emptyMessage = "No items yet.",
}: HistorySidebarProps<T>) {
  return (
    <aside className="space-y-2">
      <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-200 px-4 py-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900">
            {title} ({items.length})
          </h3>
          {onClearAll != null && items.length > 0 && (
            <button
              type="button"
              onClick={onClearAll}
              className="text-xs text-red-400 hover:text-red-600 transition-colors"
            >
              Eliminar todo
            </button>
          )}
        </div>
        <ul className="divide-y divide-gray-100 max-h-96 overflow-y-auto">
          {items.length === 0 && (
            <li className="px-4 py-3 text-xs text-gray-400 italic">{emptyMessage}</li>
          )}
          {items.map((item) => {
            const id = getId(item);
            const isSelected = selectedId === id;
            return (
              <li key={id} className="relative group">
                <button
                  type="button"
                  onClick={() => onSelect(id)}
                  className={[
                    "w-full text-left px-4 py-3 text-xs hover:bg-gray-50 transition-colors",
                    onDelete != null ? "pr-8" : "",
                    isSelected ? "bg-blue-50 border-l-2 border-blue-500" : "",
                  ].join(" ")}
                >
                  {renderItem(item)}
                </button>
                {onDelete != null && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(id);
                    }}
                    title="Eliminar del historial"
                    className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 transition-all p-1"
                  >
                    🗑
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </aside>
  );
}
