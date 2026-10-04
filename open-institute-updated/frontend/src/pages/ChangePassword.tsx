import { FormEvent, useState } from "react";
import { portalHomeForRole } from "../lib/role-access";

export default function ChangePassword() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const token = localStorage.getItem("kvbdtc_token");
      const response = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message ?? "Could not change password.");
      localStorage.setItem("kvbdtc_token", data.token);
      window.location.href = portalHomeForRole(data.role);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not change password.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="container-page flex min-h-[70vh] items-center justify-center py-16">
      <form onSubmit={submit} className="w-full max-w-md space-y-5 border border-line p-8">
        <p className="eyebrow">Secure your account</p>
        <h1 className="font-display text-3xl">Choose a new password</h1>
        <p className="text-sm text-ink/60">Your temporary password only works for your first sign-in.</p>
        <label className="block text-sm">Temporary password
          <input required type="password" autoComplete="current-password" className="input mt-1.5" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
        </label>
        <label className="block text-sm">New password
          <input required type="password" autoComplete="new-password" className="input mt-1.5" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
        </label>
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        <button className="btn-primary w-full justify-center" disabled={saving}>{saving ? "Saving…" : "Change password"}</button>
      </form>
    </main>
  );
}
