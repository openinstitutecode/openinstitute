import { FormEvent, useEffect, useState, type ChangeEvent } from "react";
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

type Profile = {
  fullName: string;
  studentNumber: string;
  admissionNumber: string;
  intake: string;
  studyMode: string;
  academicStatus: string;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  photoDataUrl: string | null;
  programme: { name: string };
  user: { email: string; phone: string | null };
};

// EX014/Batch 64 — resizes+compresses a chosen photo client-side (via
// <canvas>, no new dependency) so it fits comfortably under the backend's
// 300KB data-URL cap before it's ever sent, rather than relying on the
// user to pick a small enough file themselves.
function resizeImageToDataUrl(file: File, maxDim = 480, quality = 0.82): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read the selected file."));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("That file doesn't look like a valid image."));
      img.onload = () => {
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("Canvas isn't supported in this browser."));
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

export default function StudentProfile() {
  const userName = useCurrentUserName();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [emergencyName, setEmergencyName] = useState("");
  const [emergencyPhone, setEmergencyPhone] = useState("");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [photoSaved, setPhotoSaved] = useState(false);

  useEffect(() => {
    apiFetch<Profile>("/me/profile")
      .then((p) => {
        setProfile(p);
        setEmergencyName(p.emergencyContactName ?? "");
        setEmergencyPhone(p.emergencyContactPhone ?? "");
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load your profile."));
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    try {
      await apiFetch("/me/profile", {
        method: "PATCH",
        body: JSON.stringify({ emergencyContactName: emergencyName, emergencyContactPhone: emergencyPhone }),
      });
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
    }
  }

  async function handlePhotoChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoError(null);
    setPhotoSaved(false);
    try {
      const dataUrl = await resizeImageToDataUrl(file);
      setPhotoPreview(dataUrl);
    } catch (err) {
      setPhotoError(err instanceof Error ? err.message : "Could not process that photo.");
    }
  }

  async function savePhoto() {
    if (!photoPreview) return;
    setPhotoError(null);
    try {
      const updated = await apiFetch<Profile>("/me/profile", {
        method: "PATCH",
        body: JSON.stringify({ photoDataUrl: photoPreview }),
      });
      setProfile(updated);
      setPhotoSaved(true);
    } catch (err) {
      setPhotoError(err instanceof Error ? err.message : "Could not save photo.");
    }
  }

  return (
    <PortalShell role="Student portal" links={links} userName={profile?.fullName ?? (userName || "…")}>
      <h1 className="font-display text-2xl">My profile</h1>

      {error && <p className="mt-4 text-sm text-navy-dark">{error}</p>}

      {profile && (
        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          <PortalSection title="Institutional details">
            <dl className="space-y-3 text-sm">
              <Row label="Full name" value={profile.fullName} />
              <Row label="Student number" value={profile.studentNumber} />
              <Row label="Admission number" value={profile.admissionNumber} />
              <Row label="Programme" value={profile.programme.name} />
              <Row label="Intake" value={profile.intake} />
              <Row label="Study mode" value={profile.studyMode} />
              <Row label="Academic status" value={profile.academicStatus} />
              <Row label="Email" value={profile.user.email} />
              <Row label="Phone" value={profile.user.phone ?? "—"} />
            </dl>
            <p className="mt-4 text-xs text-ink/45">
              Institutional details are set by the registrar. Contact the
              registrar's office to correct any of these.
            </p>
          </PortalSection>

          <PortalSection title="Emergency contact">
            <form onSubmit={handleSubmit} className="space-y-4">
              <label className="block">
                <span className="text-sm font-medium text-ink/80">Name</span>
                <input value={emergencyName} onChange={(e) => setEmergencyName(e.target.value)} className="input mt-1.5" />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-ink/80">Phone</span>
                <input value={emergencyPhone} onChange={(e) => setEmergencyPhone(e.target.value)} className="input mt-1.5" />
              </label>
              <button type="submit" className="btn-primary w-full justify-center">
                Save
              </button>
              {saved && <p className="text-xs text-forest">Saved.</p>}
            </form>
          </PortalSection>

          <PortalSection title="Admit card photo">
            <p className="text-xs text-ink/50">
              Used only to print on your exam admit card, so an invigilator can check it by eye — never for any
              automated face match.
            </p>
            <div className="mt-3 flex items-center gap-4">
              {(photoPreview ?? profile.photoDataUrl) && (
                <img
                  src={photoPreview ?? profile.photoDataUrl ?? undefined}
                  alt="Profile"
                  className="h-20 w-20 rounded-sm border border-line object-cover"
                />
              )}
              <div>
                <input type="file" accept="image/*" onChange={handlePhotoChange} className="text-sm" />
                {photoPreview && (
                  <button type="button" onClick={savePhoto} className="btn-secondary mt-2 px-3 py-1 text-xs">
                    Save photo
                  </button>
                )}
              </div>
            </div>
            {photoError && <p className="mt-2 text-xs text-navy-dark">{photoError}</p>}
            {photoSaved && <p className="mt-2 text-xs text-forest">Photo saved.</p>}
          </PortalSection>
        </div>
      )}
    </PortalShell>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between border-b border-line pb-2 last:border-0">
      <dt className="text-ink/50">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
