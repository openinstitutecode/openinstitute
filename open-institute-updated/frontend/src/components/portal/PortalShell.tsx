import { NavLink, Link } from "react-router-dom";
import { ReactNode } from "react";
import Breadcrumbs from "./Breadcrumbs";
import { usePublicSettings } from "../../lib/publicSettings";
import NoticeBanner from "./NoticeBanner";
import { GlobalSearch, NotificationBell, ThemeToggle } from "./HeaderTools";
import { Logo, PrintLetterhead, COLLEGE_NAME } from "../Logo";
import { canAccessPath } from "../../lib/role-access";
import { getRole } from "../../lib/api";

export type PortalLink = { to: string; label: string; icon?: ReactNode };

export default function PortalShell({
  role,
  links,
  children,
  userName,
}: {
  role: string;
  links: PortalLink[];
  children: ReactNode;
  userName: string;
}) {
  const settings = usePublicSettings();
  const userRole = getRole();
  const visibleLinks = links.filter((link) => canAccessPath(userRole, link.to));
  const { branding } = settings;
  const flags = settings["feature.flags"]; // Batch 71 — admins can switch these off under System Settings → feature.flags (default on)
  return (
    <div className="flex min-h-screen bg-paper">
      {/* KACC-002 — lets keyboard/screen-reader users skip the sidebar */}
      <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-navy focus:shadow">
        Skip to main content
      </a>
      <aside className="hidden w-64 shrink-0 border-r border-line bg-white lg:block print:hidden portal-chrome">
        <div className="border-b border-line px-6 py-4">
          <Link to="/" className="flex items-center gap-2.5" aria-label={branding.institutionName || COLLEGE_NAME}>
            <Logo className="h-12 w-auto" />
          </Link>
          <p className="mt-2 font-mono text-xs uppercase tracking-wide text-ink/50">{role}</p>
        </div>
        <nav aria-label="Portal navigation" className="flex flex-col gap-1 p-4">
          {visibleLinks.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end
              className={({ isActive }) =>
                `rounded-sm px-3 py-2 text-sm font-medium transition-colors ${
                  isActive ? "bg-navy text-paper" : "text-ink/70 hover:bg-navy/[0.06]"
                }`
              }
            >
              {l.label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto border-t border-line p-4">
          <Link to="/" className="text-xs text-ink/50 hover:text-ink">
            ← Back to public site
          </Link>
          {branding.footerText && <p className="mt-3 text-[11px] leading-snug text-ink/40">{branding.footerText}</p>}
        </div>
      </aside>

      <div className="flex min-h-screen flex-1 flex-col">
        <header className="flex h-16 items-center justify-between border-b border-line bg-white px-6 print:hidden portal-chrome">
          <p className="hidden text-sm text-ink/60 md:block">Welcome back, {userName}</p>
          {flags["ui.global-search"] !== false ? <GlobalSearch /> : <span />}
          <span className="flex items-center gap-1">{flags["ui.theme-toggle"] !== false && <ThemeToggle />}<NotificationBell /></span>
          <button
            onClick={() => {
              localStorage.removeItem("kvbdtc_token");
              window.location.href = "/login";
            }}
            className="text-sm font-medium text-ink/60 hover:text-ink"
          >
            Sign out
          </button>
        </header>
        <NoticeBanner />
        <main id="main-content" tabIndex={-1} className="flex-1 p-6 outline-none lg:p-10">
          <PrintLetterhead />
          <Breadcrumbs />
          {children}
        </main>
      </div>
    </div>
  );
}
