const faqs = [
  {
    q: "Is Measur Business College accredited?",
    a: "Our accreditation status is published in full, and honestly, on the Accreditation page — we do not describe a programme as accredited until TVETA has confirmed it in writing.",
  },
  {
    q: "Can I study fully online?",
    a: "Yes — all our programmes are delivered virtually. Diploma programmes include a supervised industrial attachment, which is completed in person with a partner employer.",
  },
  {
    q: "What do I need to study here?",
    a: "A smartphone or computer and an intermittent internet connection are enough — the platform is built to work on a low data bundle, with downloadable materials for offline study.",
  },
  {
    q: "How is my exam integrity protected without a physical exam hall?",
    a: "Summative assessments always require human moderation. Where online proctoring is used, that will be clearly disclosed — this is one of the items still pending written confirmation from TVETA on what's acceptable for a virtual TVET institution.",
  },
  {
    q: "Do you offer KUCCPS placement?",
    a: "Not yet, and we won't claim to until KUCCPS confirms our listing and placement eligibility in writing — see the Accreditation page for current status.",
  },
  {
    q: "How do I pay fees?",
    a: "Via M-Pesa or bank transfer, from your student portal once you've been admitted and registered.",
  },
];

export default function Faqs() {
  return (
    <div className="container-page py-20">
      <p className="eyebrow">Support</p>
      <h1 className="mt-4 font-display text-4xl font-medium sm:text-5xl">
        Frequently asked questions
      </h1>

      <div className="mt-14 max-w-2xl divide-y divide-line border-t border-line">
        {faqs.map((f) => (
          <details key={f.q} className="group py-5">
            <summary className="cursor-pointer list-none font-display text-lg">
              <span className="mr-2 inline-block text-navy transition-transform group-open:rotate-45">+</span>
              {f.q}
            </summary>
            <p className="mt-3 pl-6 text-sm text-ink/70">{f.a}</p>
          </details>
        ))}
      </div>
    </div>
  );
}
