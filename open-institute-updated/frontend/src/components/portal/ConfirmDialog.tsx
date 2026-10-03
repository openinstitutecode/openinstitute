import { ReactNode, useEffect, useRef } from "react";

// KUX-015 / KACC-006 — accessible confirmation for critical actions: role="alertdialog", focus moves in
// (to Cancel, the safe default), Tab is trapped, Esc cancels, focus returns to the trigger on close.
export default function ConfirmDialog({
  open, title, children, confirmLabel = "Confirm", cancelLabel = "Cancel", danger = false, busy = false, onConfirm, onCancel,
}: {
  open: boolean; title: string; children?: ReactNode; confirmLabel?: string; cancelLabel?: string; danger?: boolean; busy?: boolean;
  onConfirm: () => void; onCancel: () => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const cancelBtn = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    cancelBtn.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") return onCancel();
      if (e.key !== "Tab" || !box.current) return;
      const f = box.current.querySelectorAll<HTMLElement>("button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex='-1'])");
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("keydown", onKey); previouslyFocused?.focus?.(); };
  }, [open, onCancel]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div ref={box} role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-body" className="w-full max-w-md border border-line bg-white p-6 shadow-lg">
        <h2 id="confirm-title" className="font-display text-xl font-medium">{title}</h2>
        <div id="confirm-body" className="mt-2 text-sm text-ink/70">{children}</div>
        <div className="mt-6 flex justify-end gap-3">
          <button ref={cancelBtn} type="button" className="btn-secondary" onClick={onCancel} disabled={busy}>{cancelLabel}</button>
          <button type="button" onClick={onConfirm} disabled={busy} className={`btn-primary disabled:opacity-60 ${danger ? "!bg-red-700 hover:!bg-red-800" : ""}`}>
            {busy ? "Working…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
