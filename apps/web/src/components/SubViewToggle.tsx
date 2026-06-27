interface SubViewToggleProps<T extends string> {
  value: T;
  onChange: (v: T) => void;
  opts: { key: T; label: string }[];
}

export function SubViewToggle<T extends string>({
  value,
  onChange,
  opts,
}: SubViewToggleProps<T>) {
  return (
    <div
      role="tablist"
      className="inline-flex rounded-lg border border-gray-300 bg-gray-100 p-0.5 gap-0.5"
    >
      {opts.map((o) => (
        <button
          key={o.key}
          role="tab"
          type="button"
          aria-selected={value === o.key}
          onClick={() => onChange(o.key)}
          className={[
            "px-5 py-1.5 rounded-md text-sm font-medium transition-colors",
            value === o.key
              ? "bg-white text-gray-900 shadow-sm"
              : "text-gray-500 hover:text-gray-700",
          ].join(" ")}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
