import type { ReactNode } from "react";

interface ThreeColumnLayoutProps {
  sidebar?: ReactNode | null;
  form?: ReactNode | null;
  data?: ReactNode | null;
  className?: string;
}

/**
 * Layout shell shared by A1, A2, A3-Planes, A3-Suscripciones and B.
 *
 * Responsive:
 *   - <lg (<1024px): single column, slots stack vertically
 *   - lg (>=1024px): sidebar (18rem) + main (1fr) — main is a 2-col subgrid
 *     of `form` | `data`
 *   - xl (>=1280px): three columns — sidebar (18rem) | form (22rem) | data (1fr)
 *
 * At `xl` the inner wrapper collapses (`display: contents`) so its children
 * participate in the outer grid directly. At `lg` it becomes a 2-col grid
 * that fills the main region. Below `lg` everything stacks.
 */
export function ThreeColumnLayout({
  sidebar = null,
  form = null,
  data = null,
  className = "",
}: ThreeColumnLayoutProps) {
  return (
    <div
      className={[
        "grid grid-cols-1 lg:grid-cols-[18rem_1fr] xl:grid-cols-[18rem_22rem_1fr] gap-6",
        className,
      ].join(" ")}
    >
      {sidebar}
      {(form != null || data != null) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:contents xl:gap-0 gap-6">
          {form}
          {data != null && <div className="space-y-4 min-w-0">{data}</div>}
        </div>
      )}
    </div>
  );
}
