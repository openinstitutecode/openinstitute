// Official Measur Business College branding. The logo file lives in /public/logo.jpg so it is served
// by nginx, cached by the service worker, and can be swapped by replacing a single file.

export const COLLEGE_NAME = "Measur Business College";
export const LOGO_SRC = "/logo.jpg";

/**
 * The logo on the page background. The source artwork has a white backdrop, so in light mode it is
 * multiplied into the cream page colour (no white box); in dark mode index.css puts it on a white chip.
 */
export function Logo({ className = "h-10 w-auto" }: { className?: string }) {
  return <img src={LOGO_SRC} alt={`${COLLEGE_NAME} logo`} className={`brand-logo ${className}`} />;
}

/** The logo on a dark (navy) surface — placed on a white chip so the navy lettering stays legible. */
export function LogoOnDark({ className = "h-14 w-auto" }: { className?: string }) {
  return (
    <span className="inline-flex rounded-md bg-white p-1.5">
      <img src={LOGO_SRC} alt={`${COLLEGE_NAME} logo`} className={className} />
    </span>
  );
}

/** Page-level letterhead that only appears when a portal page is printed / saved as PDF (the portal
 * sidebar and header are hidden in print, so this is what carries the college identity on paper). */
export function PrintLetterhead() {
  return (
    <div className="mb-6 hidden items-center gap-4 border-b-2 border-navy pb-4 print:flex">
      <img src={LOGO_SRC} alt={`${COLLEGE_NAME} logo`} className="h-16 w-auto" />
      <p className="font-display text-lg font-semibold uppercase tracking-wide text-navy-dark">{COLLEGE_NAME}</p>
    </div>
  );
}

/** Letterhead for on-screen official documents (letters, receipts, transcripts, admit cards). It is
 * also what prints, so a saved-as-PDF copy carries the college's identity. */
export function DocLetterhead({ title }: { title?: string }) {
  return (
    <div className="mb-3 flex items-center gap-3 border-b-2 border-navy pb-3 print:hidden">
      <img src={LOGO_SRC} alt={`${COLLEGE_NAME} logo`} className="h-12 w-auto" />
      <div>
        <p className="font-display text-sm font-semibold uppercase tracking-wide text-navy-dark">{COLLEGE_NAME}</p>
        {title && <p className="text-xs text-ink/55">{title}</p>}
      </div>
    </div>
  );
}
