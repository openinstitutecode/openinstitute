const leadership = [
  { role: "Principal", note: "Overall academic and institutional leadership." },
  { role: "Deputy Principal, Academics", note: "Curriculum, trainers, and quality of teaching." },
  { role: "Registrar", note: "Admissions, records, examinations, and graduation." },
  { role: "Head of ODeL & ICT", note: "Platform, connectivity, and digital delivery standards." },
  { role: "Quality Assurance Officer", note: "Internal audits and accreditation evidence." },
  { role: "Head of Student Affairs", note: "Counselling, welfare, and disability support." },
];

export default function About() {
  return (
    <div className="container-page py-20">
      <p className="eyebrow">About the college</p>
      <h1 className="mt-4 max-w-[24ch] font-display text-4xl font-medium sm:text-5xl">
        Built to teach business and digital skills entirely online, without
        pretending distance means distant.
      </h1>
      <p className="mt-6 max-w-prose text-ink/70">
        Measur Business College exists to
        make practical business and digital-skills training reachable from
        anywhere in Kenya with a smartphone and mobile data — while keeping
        the things a real college can't skip: qualified trainers, verified
        assessment, and a curriculum a regulator can inspect.
      </p>

      <div className="mt-16 grid gap-10 border-t border-line pt-16 sm:grid-cols-2">
        <div>
          <h2 className="font-display text-2xl">Vision</h2>
          <p className="mt-3 text-sm text-ink/70">
            A Kenya where geography and bandwidth no longer decide who gets a
            credible business or digital-skills qualification.
          </p>
        </div>
        <div>
          <h2 className="font-display text-2xl">Mission</h2>
          <p className="mt-3 text-sm text-ink/70">
            To deliver TVET-aligned business and digital programmes through a
            mobile-first virtual campus, combining human trainers with AI
            tutoring, at a cost within reach of ordinary Kenyan households.
          </p>
        </div>
      </div>

      <div className="mt-16 border-t border-line pt-16">
        <h2 className="font-display text-2xl">Leadership structure</h2>
        <p className="mt-3 max-w-prose text-sm text-ink/60">
          Roles below describe the leadership structure the platform is built
          around. Named appointments will be published here once confirmed.
        </p>
        <div className="mt-8 grid gap-px overflow-hidden border border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
          {leadership.map((l) => (
            <div key={l.role} className="bg-paper p-6">
              <h3 className="font-display text-lg">{l.role}</h3>
              <p className="mt-2 text-sm text-ink/60">{l.note}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
