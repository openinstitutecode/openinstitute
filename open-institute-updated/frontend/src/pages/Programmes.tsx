import { Link } from "react-router-dom";
import { programmes } from "../lib/programmes";

export default function Programmes() {
  return (
    <div className="container-page py-20">
      <p className="eyebrow">Course catalogue</p>
      <h1 className="mt-4 font-display text-4xl font-medium sm:text-5xl">
        Programmes
      </h1>
      <p className="mt-4 max-w-prose text-ink/70">
        Every programme below is delivered fully online, with practical
        assessment and, where the programme requires it, a supervised
        industrial attachment.
      </p>

      <div className="mt-14 divide-y divide-line border-t border-line">
        {programmes.map((p) => (
          <Link
            key={p.slug}
            to={`/programmes/${p.slug}`}
            className="group grid gap-4 py-8 transition-colors hover:bg-navy/[0.03] sm:grid-cols-[1fr_auto] sm:items-center"
          >
            <div>
              <p className="font-mono text-xs text-navy">{p.level}</p>
              <h2 className="mt-2 font-display text-2xl">{p.name}</h2>
              <p className="mt-2 max-w-prose text-sm text-ink/65">{p.summary}</p>
              <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-ink/50">
                <span>{p.duration}</span>
                <span>{p.mode}</span>
              </div>
            </div>
            <span className="justify-self-start text-sm font-medium text-navy group-hover:underline sm:justify-self-end">
              View details
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
