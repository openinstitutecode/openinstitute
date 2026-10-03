import { Link } from "react-router-dom";
import { programmes } from "../lib/programmes";

export default function Home() {
  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-line">
        <div className="absolute inset-0 bg-ledger opacity-40" aria-hidden />
        <div className="container-page relative grid gap-12 py-20 lg:grid-cols-[1.3fr_1fr] lg:py-28">
          <div>
            <p className="eyebrow">Virtual · Business · Digital · Kenya</p>
            <h1 className="mt-4 max-w-[16ch] font-display text-5xl font-medium leading-[1.05] sm:text-6xl">
              A business college that meets you where your phone is.
            </h1>
            <p className="mt-6 max-w-prose text-lg text-ink/70">
              Diplomas and certificates in business, accounting and digital
              marketing — taught by real trainers, supported by an AI tutor,
              and built to run on a KES 20 data bundle.
            </p>
            <div className="mt-8 flex flex-wrap gap-4">
              <Link to="/admissions" className="btn-primary">
                Start an application
              </Link>
              <Link to="/programmes" className="btn-secondary">
                See all programmes
              </Link>
            </div>
          </div>

          <div className="flex flex-col justify-between gap-6 border-l border-line pl-8">
            <div>
              <p className="font-mono text-4xl text-navy">4</p>
              <p className="mt-1 text-sm text-ink/60">
                programmes open for the current intake
              </p>
            </div>
            <div>
              <p className="font-mono text-4xl text-navy">100%</p>
              <p className="mt-1 text-sm text-ink/60">
                online delivery, with in-person industrial attachment
              </p>
            </div>
            <div>
              <p className="font-mono text-4xl text-navy">1:1</p>
              <p className="mt-1 text-sm text-ink/60">
                every learner paired with a human trainer, not just an AI
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* How it works — genuine sequence, so numbered is appropriate */}
      <section className="border-b border-line py-20">
        <div className="container-page">
          <h2 className="max-w-[22ch] font-display text-3xl font-medium">
            From application to your first day of class, in four steps
          </h2>
          <ol className="mt-12 grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                n: "1",
                title: "Apply online",
                body: "Create an account, choose a programme, and upload your KCSE or prior certificates.",
              },
              {
                n: "2",
                title: "Get your decision",
                body: "Admissions reviews your documents and sends a decision and admission letter.",
              },
              {
                n: "3",
                title: "Register & pay",
                body: "Confirm your place, pay fees by M-Pesa or bank, and pick your study mode.",
              },
              {
                n: "4",
                title: "Start learning",
                body: "Meet your trainer, join orientation, and get access to your courses and AI tutor.",
              },
            ].map((step) => (
              <li key={step.n} className="border-t-2 border-navy pt-4">
                <span className="font-mono text-sm text-navy">{step.n}</span>
                <h3 className="mt-3 font-display text-xl">{step.title}</h3>
                <p className="mt-2 text-sm text-ink/65">{step.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Programmes */}
      <section className="border-b border-line bg-navy py-20 text-paper">
        <div className="container-page">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <h2 className="max-w-[20ch] font-display text-3xl font-medium">
              Programmes built around Kenyan business realities
            </h2>
            <Link to="/programmes" className="text-sm font-medium text-gold-light hover:text-gold">
              View full catalogue
            </Link>
          </div>

          <div className="mt-12 grid gap-px overflow-hidden rounded-sm border border-paper/15 bg-paper/15 sm:grid-cols-2">
            {programmes.map((p) => (
              <Link
                key={p.slug}
                to={`/programmes/${p.slug}`}
                className="group flex flex-col justify-between gap-6 bg-navy-dark p-8 transition-colors hover:bg-navy-light"
              >
                <div>
                  <p className="font-mono text-xs text-gold-light">{p.level}</p>
                  <h3 className="mt-3 font-display text-2xl">{p.name}</h3>
                  <p className="mt-3 text-sm text-paper/65">{p.summary}</p>
                </div>
                <div className="flex items-center justify-between text-sm text-paper/50">
                  <span>{p.duration}</span>
                  <span className="text-gold-light group-hover:underline">
                    Details
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* AI + human trainer */}
      <section className="border-b border-line py-20">
        <div className="container-page grid gap-12 lg:grid-cols-2">
          <div>
            <p className="eyebrow">How teaching works here</p>
            <h2 className="mt-4 font-display text-3xl font-medium">
              An AI tutor for practice. A human trainer for judgment.
            </h2>
            <p className="mt-6 max-w-prose text-ink/70">
              Your AI tutor stays inside your course's approved material — it
              explains concepts, drills you with practice questions, and
              flags what you're still shaky on. It never sets your final
              grade and never replaces your trainer. Every exam, every
              transcript entry, and every academic decision passes through a
              person who is accountable for it.
            </p>
          </div>
          <div className="space-y-4">
            {[
              {
                who: "AI tutor",
                does: "Explains a concept three different ways until it clicks, generates extra practice questions, drafts a revision plan.",
              },
              {
                who: "Human trainer",
                does: "Designs the course, grades your assignments and exams, and is the one you message when something's genuinely wrong.",
              },
              {
                who: "Academic office",
                does: "Approves the curriculum the AI tutor is allowed to draw from, and reviews anything it generates before it reaches you.",
              },
            ].map((row) => (
              <div key={row.who} className="border border-line p-6">
                <p className="font-mono text-xs text-navy">{row.who}</p>
                <p className="mt-2 text-sm text-ink/70">{row.does}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20">
        <div className="container-page flex flex-col items-start gap-6 border border-line bg-gold/10 p-10 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-display text-2xl font-medium">
              Applications for the next intake are open.
            </h2>
            <p className="mt-2 text-sm text-ink/65">
              It takes about fifteen minutes to apply online.
            </p>
          </div>
          <Link to="/admissions" className="btn-primary shrink-0">
            Apply now
          </Link>
        </div>
      </section>
    </>
  );
}
