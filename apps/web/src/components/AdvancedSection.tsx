import type { ReactNode } from "react";

interface AdvancedSectionProps {
  children: ReactNode;
  label?: string;
}

/**
 * A styled <details><summary> wrapper for optional/advanced form fields.
 * Collapsed by default so primary forms stay clean.
 */
export function AdvancedSection({
  children,
  label = "Opciones avanzadas",
}: AdvancedSectionProps) {
  return (
    <details className="group border border-gray-200 rounded-lg overflow-hidden">
      <summary className="flex items-center justify-between px-4 py-3 cursor-pointer select-none bg-gray-50 hover:bg-gray-100 transition-colors text-sm font-medium text-gray-700 list-none">
        <span>{label}</span>
        <span className="text-gray-400 group-open:rotate-180 transition-transform duration-200 text-xs">
          ▼
        </span>
      </summary>
      <div className="px-4 pb-4 pt-3 space-y-4 bg-white border-t border-gray-100">
        {children}
      </div>
    </details>
  );
}
