import { FormEvent, useState } from "react";
import { Logo } from "../components/Logo";

const roles = [
  { id: "student", label: "Student" },
  { id: "trainer", label: "Trainer" },
  { id: "staff", label: "Staff / Admin" },
  { id: "employer", label: "Employer" },
] as const;

type RoleId = (typeof roles)[number]["id"];

export default function Login() {
  const [role, setRole] = useState<RoleId>("student");
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
        body: JSON.stringify({ email, password, role }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message ?? "Invalid credentials.");
      }
      const data = await res.json();
      localStorage.setItem("kvbdtc_token", data.token);
      const portalPath = role === "staff" ? "admin" : role;
      window.location.href = `/${portalPath}/dashboard`;
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

        <div className="mt-6 grid grid-cols-2 gap-1 border border-line p-1 sm:grid-cols-4">
          {roles.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => setRole(r.id)}
              className={`rounded-sm px-3 py-2 text-sm font-medium transition-colors ${
                role === r.id ? "bg-navy text-paper" : "text-ink/60 hover:text-ink"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="mt-8 space-y-5">
          <label className="block">
            <span className="text-sm font-medium text-ink/80">Email or student number</span>
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
