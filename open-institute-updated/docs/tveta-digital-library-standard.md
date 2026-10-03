# Towards a TVETA-standard digital library — brainstorm, not a certified spec

You asked for the best way to actually build a TVETA-standard digital
library "if my ideas are not feasible." Being direct about the honest
starting point first, same as `docs/regulatory-notes.md` does for the rest
of the platform: **TVETA has not published a named, numbered "digital
library standard"** the way, say, a library association's collection
policy might. What TVETA's TVET Act / QMS framework and CDACC's curriculum
documents actually require of a library is scattered across broader
accreditation criteria — physical/learning-resource adequacy, resource
currency, and access for the specific programmes on offer. So "TVETA
standard" here means: **what a TVETA inspection team would plausibly want
to see**, built from that framework plus ordinary library-science practice
— not a citable clause. Treat everything below as an engineering plan to
react to once you have that written confirmation, exactly like the rest of
this repo's regulatory posture.

## What an inspector is actually checking for

Reverse-engineering from TVET Act criteria and CDACC's resource-adequacy
language, a library gets judged on four things, roughly in this order:

1. **Relevance to the accredited curriculum** — not "how many books," but
   "does the collection map to the units this programme actually teaches."
2. **Currency** — dated, superseded material (especially in ICT) counts
   against you, not for you.
3. **Actual accessibility** — can an enrolled student, today, on the
   bandwidth they realistically have, get to the material — not "is there
   a subscription somewhere."
4. **A named, accountable process** — someone (a librarian, a QA officer)
   who can show acquisition, weeding, and usage records on demand.

Batch 54's federated search helps almost entirely with #3 and a bit of
#2 (DOAJ/Crossref/arXiv skew toward recent work by construction). It does
nothing for #1 or #4 on its own — a firehose of external results with no
curriculum tagging is arguably worse for an inspection than a smaller,
clearly-mapped shelf. That gap is the real next build, not another
connector.

## If your idea was "just plug in more free APIs" — why that plateaus

More sources add breadth but not defensibility. An inspector is unlikely
to be impressed by "we search five databases"; they're likely to ask "show
me the material assigned to Unit 3.2 of the Diploma in ICT" and want a
direct answer. Federated search alone can't answer that — it doesn't know
which programme a result belongs to. So the feasible, higher-value version
of "more APIs" is really "the same connectors, but curriculum-tagged,"
which is a data-modelling problem, not a sourcing problem.

## What would move the needle, in rough priority order

1. **Curriculum-to-resource mapping.** Extend `LibraryResource` (and,
   for federated results, a lightweight cache table) with a link to the
   `Unit`/`Course` model that already exists in this schema. This is the
   single highest-leverage change: it turns "we have a library" into "here
   is exactly what supports Unit 3.2," which is what #1 above actually
   asks for. LB005–010's per-type gap (still 🟡 in the audit) is a good
   place to also close this while you're in there.
2. **A written acquisition/currency/weeding policy, enforced by data, not
   prose.** A `LibraryResource.reviewDueDate` field plus a QA-style alert
   (this platform already has that pattern — see `LB035`/research alerts)
   for resources past a review window gives you a live answer to
   "how do you keep the collection current" instead of a policy document
   nobody checks against.
3. **Bandwidth-realistic access**, not just API breadth. Kenyan TVET
   students are disproportionately on mobile data. A "download for offline
   reading" affordance and even a low-bandwidth text-only mode for the
   library page would answer #3 far better than a sixth connector. This
   dovetails with the platform roadmap's already-planned "low-bandwidth
   mode rollout" (Phase 6).
4. **Named accountability + an audit trail**, which the schema mostly
   already has via `LibraryUsageEvent` (LB039) and `AdminLibraryAdmin.tsx`
   (LB040) — the gap is a librarian-facing "acquisition log" (who added
   what, when, why) distinct from usage. Small, and it directly answers
   #4.
5. **True full-text/semantic search (LB003/LB004)** is real value but is
   the most expensive item here — it needs an embeddings model, a vector
   index, and, for the internal catalogue, actual file content to embed.
   Worth doing eventually; not worth doing before 1–4, which are cheaper
   and map more directly to what gets inspected.

## Where this batch's new connectors genuinely help TVETA-relevant work

Two things worth keeping in mind rather than under-selling:

- Programme accreditation applications (this platform's `RegulatoryReport`
  / accreditation modules) sometimes want evidence of "reference material
  availability" per programme. A saved, dated federated search result set
  per unit — even before full curriculum tagging exists — is more concrete
  evidence than a claim.
- DOAJ and arXiv in particular are useful for trainers preparing content,
  independent of any inspection: current, real, citable sources for a
  Business or ICT unit, with zero procurement cost or licensing risk,
  which matters given this college has no journal subscription budget
  modelled anywhere in the finance schema.

## Bottom line

Your instinct (search for free, business/ICT-relevant digital library APIs
and wire them in) was feasible and is done in this batch. Turning that
into something that would survive a TVETA-style inspection is a separate,
larger piece of work — curriculum tagging first, then a currency/audit
trail, then bandwidth-realistic access — and none of that requires
inventing a "TVETA digital library standard" that doesn't exist; it
requires building toward what any credible inspector would actually ask
to see. Get the written TVETA/CDACC confirmation this repo's
`regulatory-notes.md` already flags as outstanding before describing any
of this as "TVETA-compliant" to a real regulator.
