import { FormEvent, useState } from "react";
import { Logo } from "../components/Logo";

// KFX-004 — request a reset link, or (with ?token=…) set a new password.
export default function ForgotPassword() {
  const token = new URLSearchParams(window.location.search).get("token");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [msg, setMsg] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (token && password !== confirm) return setMsg({ tone: "error", text: "The two passwords do not match." });
    setLoading(true);
    try {
      const res = await fetch(token ? "/api/auth/reset-password" : "/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(token ? { token, password } : { email }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.message ?? "Request failed.");
      setMsg({ tone: "ok", text: body.message });
      if (token) setTimeout(() => (window.location.href = "/login"), 1500);
    } catch (err) {
      setMsg({ tone: "error", text: err instanceof TypeError ? "Could not reach the server. Try again." : (err as Error).message });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="container-page flex min-h-[60vh] items-center justify-center py-16">
      <form onSubmit={submit} className="w-full max-w-md space-y-5 border border-line p-8 sm:p-10" noValidate={false}>
        <div className="mb-6 flex justify-center"><Logo className="h-20 w-auto" /></div>
        <p className="eyebrow">Account recovery</p>
        <h1 className="font-display text-3xl font-medium">{token ? "Choose a new password" : "Forgot your password?"}</h1>
        {token ? (
          <>
            <label className="block">
              <span className="text-sm font-medium text-ink/80">New password</span>
              <input required type="password" autoComplete="new-password" minLength={10} value={password} onChange={(e) => setPassword(e.target.value)} className="input mt-1.5" aria-describedby="pw-hint" />
              <span id="pw-hint" className="mt-1 block text-xs text-ink/50">At least 10 characters, mixing three of: lowercase, uppercase, digits, symbols.</span>
            </label>
            <label className="block">
              <span className="text-sm font-medium text-ink/80">Confirm new password</span>
              <input required type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className="input mt-1.5" />
            </label>
          </>
        ) : (
          <label className="block">
            <span className="text-sm font-medium text-ink/80">Your account email</span>
            <input required type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className="input mt-1.5" />
          </label>
        )}
        {msg && (
          <p role={msg.tone === "error" ? "alert" : "status"} className={`border p-3 text-xs ${msg.tone === "error" ? "border-gold-dark bg-gold/10 text-navy-dark" : "border-line bg-white text-ink/80"}`}>
            {msg.text}
          </p>
        )}
        <button type="submit" disabled={loading} className="btn-primary w-full justify-center disabled:opacity-60">
          {loading ? "Please wait…" : token ? "Update password" : "Send reset link"}
        </button>
        <p className="text-center text-xs text-ink/50"><a href="/login" className="underline">Back to sign in</a></p>
      </form>
    </div>
  );
}
