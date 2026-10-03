// Batch 71 — KUX-007 / KACC-004: a labelled field with an inline, screen-reader-announced error and optional hint.
import { ReactNode } from "react";

export type FieldProps = { id: string; "aria-invalid"?: true; "aria-describedby"?: string };

export default function FormField({ id, label, error, hint, required, children }: {
  id: string; label: string; error?: string; hint?: string; required?: boolean; children: (props: FieldProps) => ReactNode;
}) {
  const describedBy = [error ? `${id}-error` : "", hint ? `${id}-hint` : ""].filter(Boolean).join(" ") || undefined;
  return (
    <div className="grid gap-1">
      <label htmlFor={id} className="text-xs font-medium text-ink/70">{label}{required && <span aria-hidden className="text-red-700"> *</span>}{required && <span className="sr-only"> (required)</span>}</label>
      {children({ id, ...(error ? { "aria-invalid": true as const } : {}), "aria-describedby": describedBy })}
      {hint && !error && <p id={`${id}-hint`} className="text-[11px] text-ink/50">{hint}</p>}
      {error && <p id={`${id}-error`} role="alert" className="text-[11px] text-red-700">{error}</p>}
    </div>
  );
}

/** Returns an error message for a text value, or undefined when it is fine. */
export function textError(value: string, label: string, min: number, max?: number): string | undefined {
  const n = value.trim().length;
  if (n < min) return n === 0 ? `${label} is required.` : `${label} must be at least ${min} characters.`;
  if (max && value.length > max) return `${label} must be at most ${max} characters.`;
  return undefined;
}
