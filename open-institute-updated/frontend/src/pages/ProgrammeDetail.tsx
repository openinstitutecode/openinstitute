import { Link, useParams } from "react-router-dom";
import { getProgrammeBySlug } from "../lib/programmes";
import NotFound from "./NotFound";

export default function ProgrammeDetail() {
  const { slug } = useParams();
  const programme = slug ? getProgrammeBySlug(slug) : undefined;

  if (!programme) return <NotFound />;

  return (
    <div className="container-page py-20">
      <Link to="/programmes" className="text-sm text-navy hover:underline">
        ← All programmes
      </Link>

      <p className="eyebrow mt-8">{programme.level}</p>
      <h1 className="mt-3 max-w-[26ch] font-display text-4xl font-medium sm:text-5xl">
        {programme.name}
      </h1>
      <p className="mt-6 max-w-prose text-ink/70">{programme.summary}</p>

      <div className="mt-8 flex flex-wrap gap-8 border-y border-line py-6 text-sm">
        <div>
          <p className="text-ink/50">Duration</p>
          <p className="mt-1 font-medium">{programme.duration}</p>
        </div>
        <div>
          <p className="text-ink/50">Mode</p>
          <p className="mt-1 font-medium">{programme.mode}</p>
        </div>
        <div>
          <p className="text-ink/50">Regulatory status</p>
          <p className="mt-1 font-medium">
            <Link to="/accreditation" className="underline">
              See accreditation page
            </Link>
          </p>
        </div>
      </div>

      <div className="mt-14 grid gap-12 lg:grid-cols-2">
        <div>
          <h2 className="font-display text-2xl">Units</h2>
          <ul className="mt-5 space-y-3">
            {programme.units.map((u) => (
              <li key={u} className="flex items-baseline gap-3 border-b border-line pb-3 text-sm">
                <span className="text-ink/40">·</span>
                {u}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h2 className="font-display text-2xl">You'll be able to</h2>
          <ul className="mt-5 space-y-4">
            {programme.outcomes.map((o) => (
              <li key={o} className="text-sm text-ink/70">
                {o}
              </li>
            ))}
          </ul>

          <div className="mt-10">
            <Link to="/admissions" className="btn-primary">
              Apply for this programme
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
