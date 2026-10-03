import { useState } from "react";
import { NavLink, Link } from "react-router-dom";
import { Logo, COLLEGE_NAME } from "./Logo";

const links = [
  { to: "/about", label: "About" },
  { to: "/programmes", label: "Programmes" },
  { to: "/admissions", label: "Admissions" },
  { to: "/accreditation", label: "Accreditation" },
];

export default function Nav() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-paper/95 backdrop-blur">
      <div className="container-page flex h-16 items-center justify-between">
        <Link to="/" className="flex items-center gap-2.5">
          <Logo className="h-11 w-auto" />
          <span className="hidden font-display text-base font-semibold leading-tight text-navy-dark sm:block">
            {COLLEGE_NAME}
          </span>
        </Link>

        <nav className="hidden items-center gap-8 md:flex">
          {links.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              className={({ isActive }) =>
                `text-sm font-medium transition-colors ${
                  isActive ? "text-navy" : "text-ink/70 hover:text-ink"
                }`
              }
            >
              {l.label}
            </NavLink>
          ))}
        </nav>

        <div className="hidden items-center gap-3 md:flex">
          <Link to="/login" className="text-sm font-medium text-ink/70 hover:text-ink">
            Sign in
          </Link>
          <Link to="/admissions" className="btn-primary">
            Apply now
          </Link>
        </div>

        <button
          className="flex h-9 w-9 items-center justify-center md:hidden"
          onClick={() => setOpen((v) => !v)}
          aria-label="Toggle menu"
          aria-expanded={open}
        >
          <span className="sr-only">Menu</span>
          <div className="flex flex-col gap-1.5">
            <span className="h-0.5 w-5 bg-ink" />
            <span className="h-0.5 w-5 bg-ink" />
          </div>
        </button>
      </div>

      {open && (
        <nav className="border-t border-line bg-paper md:hidden">
          <div className="container-page flex flex-col gap-4 py-5">
            {links.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                onClick={() => setOpen(false)}
                className="text-sm font-medium text-ink/80"
              >
                {l.label}
              </NavLink>
            ))}
            <div className="flex gap-3 pt-2">
              <Link to="/login" className="btn-secondary flex-1 justify-center">
                Sign in
              </Link>
              <Link to="/admissions" className="btn-primary flex-1 justify-center">
                Apply now
              </Link>
            </div>
          </div>
        </nav>
      )}
    </header>
  );
}
