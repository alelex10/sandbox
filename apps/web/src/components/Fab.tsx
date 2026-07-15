import type { Ref } from "react";

interface FabProps {
  onClick: () => void;
  label: string;
  /** Optional ref to the underlying button. The page can capture it for
   *  focus restoration when the drawer closes (native `<dialog>` already
   *  restores focus to the trigger, but the ref is exposed for clarity
   *  and for tests). */
  buttonRef?: Ref<HTMLButtonElement>;
  variant?: "primary" | "success";
}

const VARIANT_CLASS = {
  primary: "bg-blue-600 hover:bg-blue-700 focus-visible:ring-blue-500 text-white",
  success: "bg-green-600 hover:bg-green-700 focus-visible:ring-green-500 text-white",
};

/**
 * Floating action button. Fixed bottom-right, rounded-full, prominent
 * shadow. Sits at a high z-index so it floats above the page chrome but
 * below modal dialogs.
 */
export function Fab({
  onClick,
  label,
  buttonRef,
  variant = "primary",
}: FabProps) {
  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={onClick}
      className={[
        "fixed z-30 rounded-full shadow-lg px-5 py-3 text-sm font-medium",
        "bottom-4 right-4 md:bottom-6 md:right-6",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
        "transition-colors",
        VARIANT_CLASS[variant],
      ].join(" ")}
    >
      {label}
    </button>
  );
}
