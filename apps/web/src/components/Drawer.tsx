import { useEffect, useRef, type ReactNode } from "react";

export type DrawerWidth = "narrow" | "default" | "wide";

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** When true (default), Esc / backdrop click / X close the drawer. */
  dismissable?: boolean;
  /** Visual width preset. Default ≈ 480px on sm+, full-width on mobile. */
  width?: DrawerWidth;
}

// Widths follow the design's responsive table. On mobile the drawer is
// full-screen; from sm upward it slots in from the right at the chosen
// preset width (Tailwind's `sm` is 640px, which is where the master-
// detail sidebar collapses).
const WIDTH_CLASS: Record<DrawerWidth, string> = {
  narrow: "sm:max-w-[384px]",
  default: "sm:max-w-[480px]",
  wide: "sm:max-w-[640px]",
};

/**
 * Right-side drawer built on the native `<dialog>` element. Uses
 * `showModal()` so the browser gives us focus trap, Esc handling, body
 * scroll lock, and top-layer rendering for free — no manual portal
 * or scroll-lock plumbing.
 *
 * Lifecycle: `open=true` → `showModal()`; `open=false` → `close()`. The
 * dialog's native `close` event is bridged to `onClose`. The `cancel`
 * event is intercepted with `preventDefault()` when `dismissable=false`,
 * so the drawer stays open during an in-flight submit.
 *
 * Children are rendered only while `open` is true, so form state is
 * discarded on close (matches the design's "fresh form on every open"
 * contract and lets MP Brick iframes unmount cleanly).
 */
export function Drawer({
  open,
  onClose,
  title,
  children,
  dismissable = true,
  width = "default",
}: DrawerProps) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);

  // Sync `open` prop with the native dialog.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open) {
      if (!dialog.open) dialog.showModal();
    } else {
      if (dialog.open) dialog.close();
    }
  }, [open]);

  // Wire native `close` and `cancel` events. `close` always notifies the
  // parent; `cancel` is suppressed when the drawer is not dismissable
  // (e.g. mid-submit).
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const handleClose = () => onClose();
    const handleCancel = (e: Event) => {
      if (!dismissable) {
        e.preventDefault();
      }
    };
    dialog.addEventListener("close", handleClose);
    dialog.addEventListener("cancel", handleCancel);
    return () => {
      dialog.removeEventListener("close", handleClose);
      dialog.removeEventListener("cancel", handleCancel);
    };
  }, [dismissable, onClose]);

  return (
    <dialog
      ref={dialogRef}
      onClick={(e) => {
        // Backdrop click: target IS the dialog element, not its children.
        if (dismissable && e.target === e.currentTarget) {
          dialogRef.current?.close();
        }
      }}
      // Override the browser's default `<dialog>` styling: `position: fixed;
      // inset: 0; margin: auto; display: block` centers the dialog in the
      // viewport. We want it to fill the viewport (so the backdrop covers
      // the whole screen) and the inner panel to be right-aligned.
      className="bg-transparent p-0 m-0 max-w-none max-h-none w-full h-full backdrop:bg-gray-900/50"
    >
      <div
        className={[
          // ml-auto pushes the panel to the right edge of the full-width
          // dialog. h-full on mobile (full-screen sheet); on sm+ we cap at
          // the viewport height so the panel doesn't outgrow the screen.
          "ml-auto bg-white shadow-xl flex flex-col",
          "w-full h-full sm:h-screen sm:max-h-screen overflow-y-auto sm:rounded-l-lg",
          WIDTH_CLASS[width],
        ].join(" ")}
      >
        <div className="sticky top-0 z-10 bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-gray-900 truncate">{title}</h2>
          {/*
            Close button is ALWAYS visible so the user always sees an escape
            affordance. When `dismissable` is false (e.g. mid-submit) the
            button is rendered as disabled with a muted style and an
            explanatory title. Esc and backdrop click are still blocked
            during the locked window; once the submit resolves the user
            can close freely.
          */}
          <button
            type="button"
            onClick={() => dialogRef.current?.close()}
            disabled={!dismissable}
            aria-label="Close drawer"
            title={dismissable ? "Cerrar" : "No se puede cerrar durante el envío"}
            className={[
              "text-2xl leading-none px-2 -mr-2 transition-colors",
              dismissable
                ? "text-gray-400 hover:text-gray-600 cursor-pointer"
                : "text-gray-300 cursor-not-allowed",
            ].join(" ")}
          >
            ×
          </button>
        </div>
        <div className="p-4 flex-1">{open && children}</div>
      </div>
    </dialog>
  );
}
