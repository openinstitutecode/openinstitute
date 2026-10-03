// KSEC-002 / KOPS-003 strict environment validation. Called before anything else boots.
// Production: misconfiguration is fatal (lists every problem at once). Elsewhere: warnings only.
export type EnvIssue = { key: string; level: "error" | "warn"; message: string };

const PLACEHOLDER = /replace|change[-_ ]?me|example|your[-_ ]|secret-here|dev-secret|^$/i;

const isUrl = (s: string) => {
  try {
    const u = new URL(s);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
};
const intVar = (env: NodeJS.ProcessEnv, key: string, issues: EnvIssue[], min = 0) => {
  const v = env[key];
  if (v === undefined || v === "") return;
  const n = Number(v);
  if (!Number.isInteger(n) || n < min) issues.push({ key, level: "error", message: `${key} must be an integer >= ${min} (got "${v}")` });
};

export function checkEnv(env: NodeJS.ProcessEnv = process.env): EnvIssue[] {
  const prod = env.NODE_ENV === "production";
  const issues: EnvIssue[] = [];
  const need = (key: string, why: string) => {
    if (!env[key]) issues.push({ key, level: prod ? "error" : "warn", message: `${key} is required${prod ? " in production" : ""}: ${why}` });
  };

  need("DATABASE_URL", "Postgres connection string");
  if (env.DATABASE_URL && !/^postgres(ql)?:\/\//.test(env.DATABASE_URL)) issues.push({ key: "DATABASE_URL", level: "error", message: "DATABASE_URL must start with postgresql://" });

  const jwt = env.JWT_SECRET ?? "";
  if (prod && (PLACEHOLDER.test(jwt) || jwt.length < 32)) {
    issues.push({ key: "JWT_SECRET", level: "error", message: "JWT_SECRET must be a random value of at least 32 characters in production (generate: openssl rand -base64 48)" });
  }

  need("FRONTEND_ORIGIN", "the exact browser origin(s) allowed by CORS, comma-separated");
  for (const o of (env.FRONTEND_ORIGIN ?? "").split(",").map((s) => s.trim()).filter(Boolean)) {
    if (o === "*") issues.push({ key: "FRONTEND_ORIGIN", level: "error", message: 'FRONTEND_ORIGIN must not be "*"' });
    else if (!isUrl(o)) issues.push({ key: "FRONTEND_ORIGIN", level: "error", message: `FRONTEND_ORIGIN entry "${o}" is not a valid http(s) origin` });
    else if (prod && o.startsWith("http://") && !/localhost|127\.0\.0\.1/.test(o)) issues.push({ key: "FRONTEND_ORIGIN", level: "warn", message: `"${o}" is plain http in production — terminate TLS in front of the app` });
  }

  const storageKeys = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_STORAGE_BUCKET"];
  const configuredStorageKeys = storageKeys.filter((key) => Boolean(env[key]?.trim()));
  if ((configuredStorageKeys.length > 0 && configuredStorageKeys.length < storageKeys.length) ||
      (prod && configuredStorageKeys.length === 0)) {
    issues.push({
      key: "SUPABASE_STORAGE_BUCKET",
      level: "error",
      message: "Configure SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and SUPABASE_STORAGE_BUCKET together; production requires a private Supabase Storage bucket for admission uploads.",
    });
  }
  if (env.SUPABASE_URL && !isUrl(env.SUPABASE_URL)) {
    issues.push({ key: "SUPABASE_URL", level: "error", message: "SUPABASE_URL must be a valid http(s) URL." });
  }

  if (prod && !env.TRUST_PROXY) issues.push({ key: "TRUST_PROXY", level: "warn", message: "TRUST_PROXY unset: behind a proxy every client shares one IP (breaks per-IP rate limits and lockouts)" });
  if (prod && env.VBL_INTEGRATION_URL && !env.INTEGRATION_SECRET_ENCRYPTION_KEY) issues.push({ key: "INTEGRATION_SECRET_ENCRYPTION_KEY", level: "warn", message: "VBL integration is on but credentials are stored unencrypted at rest" });

  for (const k of ["PORT", "DB_POOL_SIZE", "DB_POOL_TIMEOUT_S", "LOGIN_MAX_FAILURES", "LOGIN_LOCKOUT_MINUTES", "PASSWORD_MIN_LENGTH", "BCRYPT_ROUNDS", "AI_MAX_CONCURRENCY", "AI_MAX_QUEUE", "AI_TIMEOUT_MS", "SESSION_TTL_MINUTES"]) intVar(env, k, issues, 1);
  if (env.BCRYPT_ROUNDS && Number(env.BCRYPT_ROUNDS) < 10) issues.push({ key: "BCRYPT_ROUNDS", level: "error", message: "BCRYPT_ROUNDS below 10 is unsafe" });
  return issues;
}

/** Throws (listing every error) if any error-level issue exists; prints warnings. */
export function assertEnv(env: NodeJS.ProcessEnv = process.env): void {
  const issues = checkEnv(env);
  for (const w of issues.filter((i) => i.level === "warn")) console.warn(`[env] WARN  ${w.message}`);
  const errors = issues.filter((i) => i.level === "error");
  if (errors.length) throw new Error(`Invalid environment configuration:\n${errors.map((e) => `  - ${e.message}`).join("\n")}`);
}
