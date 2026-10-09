import { FormEvent, useState } from "react";
import { Logo } from "../components/Logo";
import { portalHomeForRole } from "../lib/role-access";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null) as { message?: string } | null;
        if (body?.message) throw new Error(body.message);
        if ([502, 503, 504].includes(res.status)) {
          throw new Error("The sign-in service is temporarily unavailable. Please try again later or contact support.");
        }
        if (res.status === 401) {
          throw new Error("The email, student number, or password is incorrect.");
        }
        throw new Error(`Sign-in could not be completed (HTTP ${res.status}). Please try again or contact support.`);
      }
      const data = await res.json();
      localStorage.setItem("kvbdtc_token", data.token);
      if (data.mustChangePassword) {
        window.location.href = "/change-password";
        return;
      }
      window.location.href = portalHomeForRole(data.role);
    } catch (err) {
      // KFX-055 — the "Is the backend running?" hint was appended to EVERY error, including a plain
      // wrong-password or an account lockout. Only a network failure (fetch rejects with TypeError) gets it.
      setError(
        err instanceof TypeError
          ? "Could not reach the server. Check your connection and try again."
          : err instanceof Error
          ? err.message
          : "Something went wrong."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="container-page flex min-h-[70vh] items-center justify-center py-16">
      <div className="w-full max-w-md border border-line p-8 sm:p-10">
        <div className="mb-6 flex justify-center"><Logo className="h-24 w-auto" /></div>
        <p className="eyebrow">Sign in</p>
        <h1 className="mt-3 font-display text-3xl font-medium">Welcome back</h1>

        <form onSubmit={handleSubmit} className="mt-8 space-y-5">
          <label className="block">
            <span className="text-sm font-medium text-ink/80">Email, student number, or admission number</span>
            <input
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input mt-1.5"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-ink/80">Password</span>
            <input
              required
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input mt-1.5"
            />
          </label>

          {error && (
            <p role="alert" className="border border-gold-dark bg-gold/10 p-3 text-xs text-navy-dark">
              {error}
            </p>
          )}

          <button type="submit" disabled={loading} className="btn-primary w-full justify-center disabled:opacity-60">
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm">
          <a href="/forgot-password" className="font-medium text-navy underline">Forgot your password?</a>
        </p>
        <p className="mt-3 text-center text-xs text-ink/50">
          Trouble signing in? Contact your programme's helpdesk.
        </p>
      </div>
    </div>
  );
}
