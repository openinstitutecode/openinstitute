import { Link, useLocation } from "react-router-dom";

// KUX-006 — contextual breadcrumbs derived from the URL. Intermediate segments are text (e.g. /admin has
// no page of its own); the first crumb links to the role's dashboard.
const looksLikeId = (s: string) => /^\d+$/.test(s) || /^c[a-z0-9]{20,}$/.test(s) || /^[0-9a-f-]{24,}$/i.test(s);
const humanise = (s: string) => (looksLikeId(s) ? "Details" : s.replace(/[-_]/g, " ").replace(/^./, (c) => c.toUpperCase()));

export function buildCrumbs(pathname: string): { label: string; to?: string }[] {
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length < 2 || parts[1] === "dashboard") return []; // dashboards need no trail
  return [
    { label: "Dashboard", to: `/${parts[0]}/dashboard` },
    ...parts.slice(1).map((p) => ({ label: humanise(p) })),
  ];
}

export default function Breadcrumbs() {
  const crumbs = buildCrumbs(useLocation().pathname);
  if (!crumbs.length) return null;
  return (
    <nav aria-label="Breadcrumb" className="mb-4 text-xs text-ink/60">
      <ol className="flex flex-wrap items-center gap-1.5">
        {crumbs.map((c, i) => (
          <li key={i} className="flex items-center gap-1.5">
            {i > 0 && <span aria-hidden>/</span>}
            {c.to ? <Link to={c.to} className="hover:text-ink hover:underline">{c.label}</Link> : <span aria-current={i === crumbs.length - 1 ? "page" : undefined}>{c.label}</span>}
          </li>
        ))}
      </ol>
    </nav>
  );
}
