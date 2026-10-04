import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { createHash, randomBytes } from "node:crypto";
import { JWT_SECRET, requireAuth, AuthedRequest } from "../middleware/auth.js";
import { lockoutStatus, throttlePolicy } from "../lib/login-throttle.js";
import { validatePassword, bcryptRounds } from "../lib/password-policy.js";
import { securityEvent } from "../lib/logger.js";
import { dispatchNotification } from "../lib/notify.js";
import { primaryOrigin } from "../lib/cors-origins.js";

export const authRouter = Router();

// KSEC-028 — configurable session lifetime (default 12 h, as before).
function sessionTtlSeconds(): number {
  const m = Number(process.env.SESSION_TTL_MINUTES);
  return (Number.isInteger(m) && m > 0 ? m : 720) * 60;
}

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  portal: z.enum(["student", "trainer", "staff", "employer", "alumni", "applicant"]).optional(),
});

authRouter.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Enter a valid email and password." });
  }
  const email = parsed.data.email.trim().toLowerCase();
  const { password } = parsed.data;

  const user = await prisma.user.findUnique({ where: { email } })
    ?? await prisma.user.findUnique({ where: { email: parsed.data.email } });

  // KSEC-005 / KFX-009 — brute-force lockout, per account AND per IP, from the shared
  // FailedLoginAttempt table (holds across restarts and API instances). Attempts rejected *because*
  // locked are recorded as "locked" and not counted, so hammering cannot extend the lock. A successful
  // login (lastLoginAt) resets the account's count. Unknown emails are throttled identically, so the
  // response never reveals whether an account exists.
  const policy = throttlePolicy();
  const now = new Date();
  const windowStart = new Date(now.getTime() - policy.windowMinutes * 60_000);
  const acctSince = user?.lastLoginAt && user.lastLoginAt > windowStart ? user.lastLoginAt : windowStart;
  const [acctFails, ipFails] = await Promise.all([
    prisma.failedLoginAttempt.findMany({
      where: { email: { equals: email, mode: "insensitive" }, attemptedAt: { gt: acctSince }, reason: { not: "locked" } },
      select: { attemptedAt: true },
      take: policy.maxFailures + 50,
    }),
    req.ip
      ? prisma.failedLoginAttempt.findMany({
          where: { ipAddress: req.ip, attemptedAt: { gt: windowStart }, reason: { not: "locked" } },
          select: { attemptedAt: true },
          take: policy.ipMaxFailures + 50,
        })
      : Promise.resolve([] as { attemptedAt: Date }[]),
  ]);
  const acctLock = lockoutStatus(acctFails.map((a) => a.attemptedAt), now, policy.maxFailures, policy.windowMinutes);
  const ipLock = lockoutStatus(ipFails.map((a) => a.attemptedAt), now, policy.ipMaxFailures, policy.windowMinutes);
  const lock = acctLock.locked ? acctLock : ipLock;
  if (lock.locked) {
    await prisma.failedLoginAttempt.create({ data: { email, ipAddress: req.ip, reason: "locked" } });
    securityEvent("login_locked", { email, ip: req.ip, scope: acctLock.locked ? "account" : "ip", retryAfterSeconds: lock.retryAfterSeconds });
    res.setHeader("Retry-After", String(lock.retryAfterSeconds));
    return res.status(429).json({
      message: `Too many failed sign-in attempts. Try again in ${Math.ceil(lock.retryAfterSeconds / 60)} minute(s).`,
      code: "LOGIN_LOCKED",
      retryAfterSeconds: lock.retryAfterSeconds,
    });
  }

  if (!user || !user.isActive) {
    await prisma.failedLoginAttempt.create({
      data: { email, ipAddress: req.ip, reason: !user ? "no_such_user" : "inactive_user" },
    });
    return res.status(401).json({ message: "Incorrect email or password." });
  }

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) {
    await prisma.failedLoginAttempt.create({ data: { email, ipAddress: req.ip, reason: "wrong_password" } });
    return res.status(401).json({ message: "Incorrect email or password." });
  }
  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });

  const token = jwt.sign(
    { sub: user.id, role: user.role, email: user.email, mustChangePassword: user.mustChangePassword },
    JWT_SECRET,
    { expiresIn: sessionTtlSeconds() }
  );

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: "LOGIN",
      entityType: "User",
      entityId: user.id,
    },
  });

  res.json({ token, role: user.role, mustChangePassword: user.mustChangePassword });
});

// ---------------------------------------------------------------------------
// KFX-004 / KSEC-023 — password recovery. There was no reset flow at all (imported users even carry an
// empty hash with the comment "would need reset flow"). Tokens: 256-bit random, only the SHA-256 is
// stored, 30-minute expiry, single use (claimed with a conditional UPDATE so two concurrent submits
// cannot both succeed), and the response never reveals whether an email is registered.
// ---------------------------------------------------------------------------
const sha256 = (v: string) => createHash("sha256").update(v).digest("hex");
const RESET_TTL_MS = 30 * 60_000;
const GENERIC_RESET_REPLY = { message: "If that email is registered, a reset link has been sent." };

authRouter.post("/forgot-password", async (req, res) => {
  const parsed = z.object({ email: z.string().email() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Enter a valid email address." });
  const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  if (user?.isActive) {
    const recent = await prisma.passwordResetToken.count({ where: { userId: user.id, createdAt: { gt: new Date(Date.now() - 3_600_000) } } });
    if (recent < 3) {
      const token = randomBytes(32).toString("base64url");
      await prisma.passwordResetToken.create({
        data: { userId: user.id, tokenHash: sha256(token), expiresAt: new Date(Date.now() + RESET_TTL_MS), requestIp: req.ip },
      });
      const link = `${primaryOrigin(process.env.FRONTEND_ORIGIN)}/forgot-password?token=${token}`;
      await dispatchNotification({
        channel: "email",
        to: user.email,
        title: "Reset your Measur Business College password",
        body: `Use this link within 30 minutes to choose a new password:\n${link}\n\nIf you did not ask for this, ignore this email — your password is unchanged.`,
      }).catch(() => undefined); // delivery failure must not change the (deliberately uniform) response
      securityEvent("password_reset_requested", { userId: user.id, ip: req.ip });
    }
  }
  res.json(GENERIC_RESET_REPLY);
});

authRouter.post("/reset-password", async (req, res) => {
  const parsed = z.object({ token: z.string().min(20).max(200), password: z.string().min(1).max(200) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid request." });
  const bad = { message: "This reset link is invalid or has expired. Request a new one.", code: "RESET_TOKEN_INVALID" };

  const row = await prisma.passwordResetToken.findUnique({ where: { tokenHash: sha256(parsed.data.token) }, include: { user: true } });
  if (!row || row.usedAt || row.expiresAt < new Date() || !row.user.isActive) return res.status(400).json(bad);

  const policyCheck = validatePassword(parsed.data.password, { email: row.user.email });
  if (!policyCheck.ok) return res.status(400).json({ message: policyCheck.problems.join(" "), code: "WEAK_PASSWORD", issues: policyCheck.problems });

  const passwordHash = await bcrypt.hash(parsed.data.password, bcryptRounds());
  const claimed = await prisma.$transaction(async (tx) => {
    const c = await tx.passwordResetToken.updateMany({ where: { id: row.id, usedAt: null }, data: { usedAt: new Date() } });
    if (c.count !== 1) return false; // lost the race — token already spent
    await tx.user.update({ where: { id: row.userId }, data: { passwordHash } });
    await tx.passwordResetToken.updateMany({ where: { userId: row.userId, usedAt: null }, data: { usedAt: new Date() } }); // kill sibling links
    await tx.failedLoginAttempt.deleteMany({ where: { email: { equals: row.user.email, mode: "insensitive" } } }); // lift any lockout
    await tx.auditLog.create({ data: { userId: row.userId, action: "PASSWORD_RESET", entityType: "User", entityId: row.userId } });
    return true;
  });
  if (!claimed) return res.status(400).json(bad);
  securityEvent("password_reset_completed", { userId: row.userId, ip: req.ip });
  res.json({ message: "Password updated. You can now sign in." });
});

authRouter.post("/change-password", requireAuth, async (req: AuthedRequest, res) => {
  const parsed = z.object({ currentPassword: z.string().min(1), newPassword: z.string().min(1).max(200) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Enter your current and new password." });
  const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
  if (!user || !(await bcrypt.compare(parsed.data.currentPassword, user.passwordHash))) {
    securityEvent("change_password_bad_current", { userId: req.user!.id, ip: req.ip });
    return res.status(403).json({ message: "Your current password is incorrect.", code: "BAD_CURRENT_PASSWORD" });
  }
  const check = validatePassword(parsed.data.newPassword, { email: user.email });
  if (!check.ok) return res.status(400).json({ message: check.problems.join(" "), code: "WEAK_PASSWORD", issues: check.problems });
  if (await bcrypt.compare(parsed.data.newPassword, user.passwordHash)) return res.status(400).json({ message: "Choose a password you have not used before.", code: "PASSWORD_REUSED" });
  await prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash(parsed.data.newPassword, bcryptRounds()), mustChangePassword: false } }),
    prisma.auditLog.create({ data: { userId: user.id, action: "PASSWORD_CHANGED", entityType: "User", entityId: user.id } }),
  ]);
  const token = jwt.sign(
    { sub: user.id, role: user.role, email: user.email, mustChangePassword: false },
    JWT_SECRET,
    { expiresIn: sessionTtlSeconds() }
  );
  res.json({ message: "Password changed.", token, role: user.role });
});
