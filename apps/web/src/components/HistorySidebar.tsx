import { useEffect, useRef, useState, type ReactNode } from "react";

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
  /** Optional content rendered below the list (e.g. a `<Pagination>` control).
   *  Hidden when not provided. */
  footer?: ReactNode;
}

/**
 * Generic sidebar with: title (including count), `…` overflow menu (for
 * bulk destructive actions), scrollable list, selected-item highlight,
 * and an optional per-item delete button.
 *
 * The list is fluid-height: it grows with content (no `max-h-96` clamp).
 * The shell's max height is whatever the grid row gives it.
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
  footer,
}: HistorySidebarProps<T>) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  // Close the overflow menu on outside click.
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  return (
    <aside className="space-y-2">
      <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-200 px-4 py-3 flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-gray-900">
            {title} ({items.length})
          </h3>
          {onClearAll != null && items.length > 0 && (
            <div className="relative" ref={menuRef}>
              <button
                type="button"
                onClick={() => setMenuOpen((v) => !v)}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                aria-label="Más acciones"
                title="Más acciones"
                className="text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors rounded text-lg leading-none w-7 h-7 inline-flex items-center justify-center"
              >
                ⋯
              </button>
              {menuOpen && (
                <div
                  role="menu"
                  className="absolute right-0 top-full mt-1 w-44 bg-white border border-gray-200 rounded-md shadow-lg z-20 py-1"
                >
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false);
                      onClearAll();
                    }}
                    className="w-full text-left px-3 py-2 text-xs text-red-600 font-medium hover:bg-red-50 transition-colors"
                  >
                    Eliminar todo
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
        <ul className="divide-y divide-gray-100">
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
        {footer != null && (
          <div className="border-t border-gray-100 px-2 py-1">{footer}</div>
        )}
      </div>
    </aside>
  );
}
