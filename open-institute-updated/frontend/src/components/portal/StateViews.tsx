import { ReactNode } from "react";

// KUX-008 — one consistent look (and screen-reader behaviour) for loading / empty / error states.
export function LoadingState({ label = "Loading…" }: { label?: string }) {
  return (
    <div role="status" aria-live="polite" className="flex items-center gap-3 py-10 text-sm text-ink/60">
      <span aria-hidden className="h-4 w-4 animate-spin rounded-full border-2 border-navy/20 border-t-navy motion-reduce:animate-none" />
      {label}
    </div>
  );
}

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="border border-dashed border-line px-6 py-10 text-center">
      <p className="font-display text-lg text-ink">{title}</p>
      {hint && <p className="mx-auto mt-1 max-w-md text-sm text-ink/60">{hint}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="border border-gold-dark bg-gold/10 p-4 text-sm text-navy-dark">
      <p>{message}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="mt-2 font-medium underline">
          Try again
        </button>
      )}
    </div>
  );
}
