// Batch 74 — front end for batch 72's /api/self endpoints: KFEAT-001 profile, KFEAT-003 documents, KFEAT-004 services,
// KFEAT-008 transcript, KFEAT-010 alerts, KFEAT-079 announcements, KDATA-005 privacy notice acknowledgement.
import { useEffect, useState, useCallback } from "react";
import PortalShell from "../../components/portal/PortalShell";
import { PortalSection, StatCard, Table, Badge } from "../../components/portal/Primitives";
import { LoadingState, ErrorState, EmptyState } from "../../components/portal/StateViews";
import { Link } from "react-router-dom";
import { apiFetch, useCurrentUserName } from "../../lib/api";

const links = [
  { to: "/student/dashboard", label: "Dashboard" },
  { to: "/student/record", label: "My Record" },
  { to: "/student/account", label: "Account & Progress" },
  { to: "/student/fees", label: "Fees" },
  { to: "/student/grades", label: "Grades" },
];
type Profile = { studentNumber: string; fullName: string; intake: string; studyMode: string; academicStatus: string; programme: { name: string; qualificationLevel: string }; enrolments: Record<string, number>; feesOutstanding: number; activeHolds: number; openTickets: number; activePlacements: number; competenciesAchieved: number; certificates: number };
type Alerts = { count: number; alerts: { code: string; severity: "info" | "warning" | "critical"; message: string }[] };
type Transcript = { gpa: number | null; creditsGraded: number; creditsPassed: number; semesters: { semester: string; units: { code: string; title: string; credits: number; status: string; grade: string | null }[] }[]; issued: { id: string; issuedAt: string; verificationUrl: string }[]; note: string };
type Docs = { total: number; items: { kind: string; id: string; label: string; date: string; status: string; verificationUrl?: string }[] };
type Services = { needsAttention: { unreadNotifications: number; openTickets: number; openDataRequests: number } };
type Announcement = { id: string; title: string; content: string; importance: string; pinned: boolean; createdAt: string; unit: { code: string; title: string } };
type Privacy = { notice: { version: string; summary: string; url?: string }; acknowledgedVersion: string | null; needsAcknowledgement: boolean };
const QUICK_LINKS: [string, string][] = [["Fees and statements", "/student/fees"], ["Account, tickets and data requests", "/student/account"], ["Support", "/student/support"], ["Academic alerts", "/student/alerts"], ["Grades", "/student/grades"], ["Official letters", "/student/letters"], ["Receipts", "/student/receipts"], ["Digital ID", "/student/id-card"]];
const sev = (s: string) => (s === "critical" ? "danger" : s === "warning" ? "warn" : "neutral") as "danger" | "warn" | "neutral";
const day = (d: string) => new Date(d).toLocaleDateString("en-KE");

export default function StudentRecord() {
  const userName = useCurrentUserName();
  const [p, setP] = useState<Profile>();
  const [alerts, setAlerts] = useState<Alerts>();
  const [tr, setTr] = useState<Transcript>();
  const [docs, setDocs] = useState<Docs>();
  const [svc, setSvc] = useState<Services>();
  const [ann, setAnn] = useState<Announcement[]>();
  const [priv, setPriv] = useState<Privacy>();
  const [error, setError] = useState<string>();
  const load = useCallback(() => {
    Promise.all([
      apiFetch<Profile>("/self/profile").then(setP), apiFetch<Alerts>("/self/alerts").then(setAlerts), apiFetch<Transcript>("/self/transcript").then(setTr),
      apiFetch<Docs>("/self/documents").then(setDocs), apiFetch<Services>("/self/services").then(setSvc), apiFetch<Announcement[]>("/self/announcements").then(setAnn),
      apiFetch<Privacy>("/self/privacy-notice").then(setPriv),
    ]).catch((e: Error) => setError(e.message));
  }, []);
  useEffect(load, [load]);
  async function acknowledge() {
    try { await apiFetch("/self/privacy-notice/acknowledge", { method: "POST" }); load(); } catch (e) { setError((e as Error).message); }
  }
  return (
    <PortalShell role="Student portal" links={links} userName={userName}>
      <h1 className="font-display text-3xl font-medium">My record</h1>
      {error && <div className="mt-6"><ErrorState message={error} onRetry={() => { setError(undefined); load(); }} /></div>}
      {!error && !p && <LoadingState />}
      {p && (
        <div className="mt-6 space-y-8">
          <p className="text-sm text-ink/60">{p.fullName} · {p.studentNumber} · {p.programme.name} ({p.programme.qualificationLevel}) · intake {p.intake} · {p.studyMode} · <Badge tone={p.academicStatus === "ACTIVE" ? "ok" : "warn"}>{p.academicStatus}</Badge></p>
          {priv?.needsAcknowledgement && (
            <div role="region" aria-label="Privacy notice" className="border border-gold/50 bg-gold/10 p-4 text-sm">
              <p className="font-medium">Privacy notice (version {priv.notice.version}) needs your acknowledgement</p>
              <p className="mt-1 text-ink/70">{priv.notice.summary}</p>
              <div className="mt-3 flex gap-3">
                {priv.notice.url && <a className="btn-secondary" href={priv.notice.url} target="_blank" rel="noopener noreferrer">Read in full</a>}
                <button className="btn-primary" onClick={acknowledge}>I have read this</button>
              </div>
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Fees outstanding" value={`KES ${p.feesOutstanding.toLocaleString("en-KE")}`} hint={p.activeHolds ? `${p.activeHolds} active hold(s)` : undefined} />
            <StatCard label="GPA (unofficial)" value={tr?.gpa ?? "—"} hint={tr ? `${tr.creditsPassed}/${tr.creditsGraded} credits passed` : undefined} />
            <StatCard label="Competencies achieved" value={p.competenciesAchieved} />
            <StatCard label="Needs attention" value={svc ? svc.needsAttention.unreadNotifications + svc.needsAttention.openTickets + svc.needsAttention.openDataRequests : "—"} hint={svc ? `${svc.needsAttention.unreadNotifications} unread · ${svc.needsAttention.openTickets} open tickets` : undefined} />
          </div>

          <nav aria-label="Self-service" className="flex flex-wrap gap-2">
            {QUICK_LINKS.map(([label, to]) => <Link key={to} to={to} className="border border-line bg-white px-3 py-2 text-sm text-navy underline decoration-dotted">{label}</Link>)}
          </nav>

          <PortalSection title="Progress alerts">
            {!alerts ? <LoadingState /> : alerts.count === 0 ? <EmptyState title="No alerts" hint="Nothing needs your attention right now." /> : (
              <ul className="space-y-3">{alerts.alerts.map((a) => <li key={a.code} className="flex items-start gap-3 text-sm"><Badge tone={sev(a.severity)}>{a.severity}</Badge><span>{a.message}</span></li>)}</ul>
            )}
          </PortalSection>

          <PortalSection title="Announcements from my courses">
            {!ann ? <LoadingState /> : ann.length === 0 ? <EmptyState title="No announcements" /> : (
              <ul className="divide-y divide-line">{ann.slice(0, 8).map((a) => (
                <li key={a.id} className="py-3 text-sm">
                  <p className="font-medium">{a.pinned && <Badge tone="warn">pinned</Badge>} {a.title} <span className="text-ink/45">· {a.unit.code} · {day(a.createdAt)}</span></p>
                  <p className="mt-1 whitespace-pre-line text-ink/70">{a.content}</p>
                </li>))}</ul>
            )}
          </PortalSection>

          <PortalSection title="Transcript (unofficial view)">
            {!tr ? <LoadingState /> : tr.semesters.length === 0 ? <EmptyState title="No unit results yet" /> : (
              <div className="space-y-6">
                {tr.semesters.map((s) => (
                  <div key={s.semester}>
                    <h3 className="mb-2 text-sm font-medium">{s.semester}</h3>
                    <Table columns={["Code", "Unit", "Credits", "Status", "Grade"]} rows={s.units.map((u) => [u.code, u.title, u.credits, u.status.replace("_", " "), u.grade ?? "—"])} />
                  </div>))}
                <p className="text-xs text-ink/50">{tr.note}</p>
              </div>
            )}
          </PortalSection>

          <PortalSection title="My documents">
            {!docs ? <LoadingState /> : docs.total === 0 ? <EmptyState title="No documents yet" /> : (
              <Table columns={["Type", "Document", "Date", "Status", ""]} rows={docs.items.map((d) => [d.kind, d.label, day(d.date), <Badge key="s" tone={d.status === "revoked" ? "danger" : d.status === "unverified" ? "warn" : "ok"}>{d.status}</Badge>, d.verificationUrl ? <a key="v" className="underline" href={d.verificationUrl} target="_blank" rel="noopener noreferrer">Verify</a> : ""])} />
            )}
          </PortalSection>
        </div>
      )}
    </PortalShell>
  );
}
