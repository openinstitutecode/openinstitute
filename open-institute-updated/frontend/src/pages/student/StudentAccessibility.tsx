import { useEffect, useState } from "react";
import PortalShell from "../../components/portal/PortalShell";
import { PortalSection } from "../../components/portal/Primitives";
import { apiFetch, useCurrentUserName } from "../../lib/api";

const links = [
  { to: "/student/dashboard", label: "Dashboard" },
  { to: "/student/profile", label: "My Profile" },
  { to: "/student/id-card", label: "Digital ID" },
  { to: "/student/roadmap", label: "Programme Roadmap" },
  { to: "/student/courses", label: "My Courses" },
  { to: "/student/assignments", label: "Assignment Centre" },
  { to: "/student/exams", label: "Assessment Centre" },
  { to: "/student/alerts", label: "Academic Alerts" },
  { to: "/student/notebook", label: "Knowledge Notebook" },
  { to: "/student/portfolio", label: "Digital Portfolio" },
  { to: "/student/advisor", label: "AI Study Advisor" },
  { to: "/student/letters", label: "Official Letters" },
  { to: "/student/receipts", label: "Payment Receipts" },
  { to: "/student/research", label: "Research Workspace" },
  { to: "/student/messages", label: "Messages & Office Hours" },
  { to: "/student/forums", label: "Discussion Forums" },
  { to: "/student/timetable", label: "Timetable" },
  { to: "/student/attendance", label: "Attendance" },
  { to: "/student/achievements", label: "Achievements" },
  { to: "/student/library", label: "Digital Library" },
  { to: "/student/tutor", label: "AI Tutor" },
  { to: "/student/career", label: "Career Services" },
  { to: "/student/job-matches", label: "Job Matches" },
  { to: "/student/simulation", label: "Business Simulation Lab" },
  { to: "/student/virtual-lab", label: "Virtual Business Lab" },
  { to: "/student/viva", label: "AI Viva Practice" },
  { to: "/student/passport", label: "Competency Passport" },
  { to: "/student/grades", label: "Grades & Transcript" },
  { to: "/student/appeals", label: "Appeals" },
  { to: "/student/fees", label: "Fees" },
  { to: "/student/attachment", label: "Industrial Attachment" },
  { to: "/student/graduation", label: "Graduation Status" },
  { to: "/student/wellbeing", label: "Counselling & Support" },
  { to: "/student/events", label: "Clubs & Events" },
  { to: "/student/support", label: "Support" },
  { to: "/student/accessibility", label: "Accessibility Settings" },
  { to: "/student/credit-transfer", label: "Credit Transfer" },
  { to: "/student/tutor-sessions", label: "Tutor Session History" },
];

type Prefs = {
  fontSize: number;
  lineHeight: number;
  contrastMode: "normal" | "high";
  dyslexiaFriendlyFont: boolean;
  reducedMotion: boolean;
  screenReaderOptimized: boolean;
  lowBandwidthMode: boolean;
};

const defaults: Prefs = {
  fontSize: 16,
  lineHeight: 1.5,
  contrastMode: "normal",
  dyslexiaFriendlyFont: false,
  reducedMotion: false,
  screenReaderOptimized: false,
  lowBandwidthMode: false,
};

export default function StudentAccessibility() {
  const userName = useCurrentUserName();
  const [prefs, setPrefs] = useState<Prefs>(defaults);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    apiFetch<Prefs>("/accessibility/preferences")
      .then(setPrefs)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load your preferences."));
  }, []);

  async function save() {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const updated = await apiFetch<Prefs>("/accessibility/preferences", { method: "PUT", body: JSON.stringify(prefs) });
      setPrefs(updated);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save preferences.");
    } finally {
      setBusy(false);
    }
  }

  async function reset() {
    setBusy(true);
    setError(null);
    try {
      const updated = await apiFetch<Prefs>("/accessibility/preferences/reset", { method: "POST" });
      setPrefs(updated);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reset preferences.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <PortalShell role="Student portal" links={links} userName={userName}>
      <h1 className="font-display text-2xl">Accessibility settings</h1>
      <p className="mt-2 max-w-prose text-sm text-ink/60">
        These apply to your own account only. They currently store your
        preference — wiring every screen in the portal to honour them is a
        larger follow-on piece of work, tracked separately.
      </p>

      {error && <p className="mt-4 text-sm text-navy-dark">{error}</p>}
      {saved && <p className="mt-4 text-sm text-forest">Saved.</p>}

      <div className="mt-8 max-w-lg">
        <PortalSection title="Reading preferences">
          <div className="space-y-4">
            <label className="block">
              <span className="text-sm font-medium text-ink/80">Font size</span>
              <select
                value={prefs.fontSize}
                onChange={(e) => setPrefs((p) => ({ ...p, fontSize: Number(e.target.value) }))}
                className="input mt-1.5"
              >
                {[14, 16, 18, 20].map((s) => (
                  <option key={s} value={s}>
                    {s}px
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="text-sm font-medium text-ink/80">Line height</span>
              <select
                value={prefs.lineHeight}
                onChange={(e) => setPrefs((p) => ({ ...p, lineHeight: Number(e.target.value) }))}
                className="input mt-1.5"
              >
                {[1.5, 1.8, 2.0].map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="text-sm font-medium text-ink/80">Contrast</span>
              <select
                value={prefs.contrastMode}
                onChange={(e) => setPrefs((p) => ({ ...p, contrastMode: e.target.value as Prefs["contrastMode"] }))}
                className="input mt-1.5"
              >
                <option value="normal">Normal</option>
                <option value="high">High contrast</option>
              </select>
            </label>

            {(
              [
                ["dyslexiaFriendlyFont", "Dyslexia-friendly font"],
                ["reducedMotion", "Reduce motion and animation"],
                ["screenReaderOptimized", "Optimise for screen readers"],
                ["lowBandwidthMode", "Low-bandwidth mode (fewer/lower autoplay media, text-first lessons)"],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={prefs[key]} onChange={(e) => setPrefs((p) => ({ ...p, [key]: e.target.checked }))} />
                {label}
              </label>
            ))}

            <div className="flex gap-3 pt-2">
              <button onClick={save} disabled={busy} className="btn-primary disabled:opacity-50">
                {busy ? "Saving…" : "Save preferences"}
              </button>
              <button onClick={reset} disabled={busy} className="rounded-full border border-line px-4 py-2 text-sm font-medium text-ink/70 hover:bg-cream">
                Reset to defaults
              </button>
            </div>
          </div>
        </PortalSection>
      </div>
    </PortalShell>
  );
}
