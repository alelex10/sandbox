import type { ReactNode } from "react";

interface MasterDetailProps {
  /** Sidebar content (typically a `<HistorySidebar>`). */
  sidebar: ReactNode;
  /** Detail column content (cards stacked vertically). */
  detail: ReactNode;
  /** Floating action button (a `<Fab>` instance). Rendered as a fixed-position
   *  sibling so it floats above both columns. */
  fab: ReactNode;
  className?: string;
}

/**
 * 2-column master/detail shell that replaced the old 3-column layout.
 *
 * At ≥lg the layout is a 2-col grid: a 22rem sidebar plus a flexible
 * detail column. Below lg the sidebar collapses to a closed `<details>`
 * strip above the detail — no hamburger overlay, no JS framework, just
 * native HTML.
 *
 * The `fab` is a fixed-position sibling so it floats over both columns
 * regardless of breakpoint.
 */
export function MasterDetail({
  sidebar,
  detail,
  fab,
  className = "",
}: MasterDetailProps) {
  return (
    <div className={["relative", className].join(" ")}>
      <div className="grid grid-cols-1 lg:grid-cols-[22rem_1fr] gap-6 items-start">
        {/* <lg: collapsible <details> strip. Closed by default. When open,
            the inner content scrolls inside a fixed max-h strip. */}
        <details className="lg:hidden rounded-lg border border-gray-200 bg-white shadow-sm group">
          <summary className="cursor-pointer select-none px-4 py-3 text-sm font-semibold text-gray-900 list-none flex items-center justify-between hover:bg-gray-50 transition-colors">
            <span>Historial</span>
            <span className="text-gray-400 text-xs transition-transform group-open:rotate-180">
              ▼
            </span>
          </summary>
          <div className="border-t border-gray-200 max-h-64 overflow-y-auto">
            {sidebar}
          </div>
        </details>

        {/* ≥lg: full-height sidebar. */}
        <div className="hidden lg:block min-w-0">{sidebar}</div>

        {/* Detail column. min-w-0 lets cards inside (which can have long
            subscription IDs) shrink and wrap rather than overflow. */}
        <div className="space-y-4 min-w-0">{detail}</div>
      </div>
      {fab}
    </div>
  );
}
