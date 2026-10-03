// KSEC-003 password policy. Length matters more than composition (NIST 800-63B), but we also require
// mixed character classes because staff/students routinely choose short passwords.
const COMMON = new Set(["password", "password1", "password123", "12345678", "123456789", "1234567890", "qwerty123", "qwertyuiop", "iloveyou", "admin123", "welcome1", "welcome123", "letmein123", "changeme", "abc12345", "kenya2020", "kenya123", "student123", "trainer123", "p@ssw0rd", "p@ssword1", "kvbdtc123"]);

export function minLength(): number {
  const n = Number(process.env.PASSWORD_MIN_LENGTH);
  return Number.isInteger(n) && n >= 8 ? n : 10;
}

export function validatePassword(pw: string, ctx: { email?: string; name?: string } = {}): { ok: boolean; problems: string[] } {
  const problems: string[] = [];
  const min = minLength();
  if (pw.length < min) problems.push(`Use at least ${min} characters.`);
  if (pw.length > 128) problems.push("Use at most 128 characters.");
  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((r) => r.test(pw)).length;
  if (classes < 3) problems.push("Mix at least three of: lowercase, uppercase, digits, symbols.");
  if (COMMON.has(pw.toLowerCase())) problems.push("That password is too common.");
  if (/(.)\1{3,}/.test(pw)) problems.push("Avoid repeating the same character four or more times.");
  const lower = pw.toLowerCase().replace(/[^a-z0-9]/g, ""); // "jane-doe" must not evade a check for "janedoe"
  const local = ctx.email?.split("@")[0]?.toLowerCase();
  if (local && local.length >= 4 && lower.includes(local)) problems.push("Do not include your email name in the password.");
  for (const part of (ctx.name ?? "").toLowerCase().split(/\s+/)) if (part.length >= 4 && lower.includes(part)) problems.push("Do not include your name in the password.");
  return { ok: problems.length === 0, problems: [...new Set(problems)] };
}

export function bcryptRounds(): number {
  const n = Number(process.env.BCRYPT_ROUNDS);
  return Number.isInteger(n) && n >= 10 && n <= 15 ? n : 12;
}
