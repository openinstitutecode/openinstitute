import { Router } from "express";
import { z } from "zod";
import crypto from "crypto";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireRole, AuthedRequest } from "../middleware/auth.js";

export const securityRouter = Router();

// ---------------------------------------------------------------------------
// AD030 — security centre: real failed-login attempts (written directly in
// the login handler) and real MFA-enrollment status, not a cosmetic
// "security score."
// ---------------------------------------------------------------------------
securityRouter.get(
  "/failed-logins",
  requireAuth,
  requireRole("ICT_ADMIN", "SUPER_ADMIN", "AUDITOR"),
  async (_req: AuthedRequest, res) => {
    const attempts = await prisma.failedLoginAttempt.findMany({
      orderBy: { attemptedAt: "desc" },
      take: 200,
    });
    const byEmail = attempts.reduce<Record<string, number>>((acc, a) => {
      acc[a.email] = (acc[a.email] ?? 0) + 1;
      return acc;
    }, {});
    const repeatedTargets = Object.entries(byEmail)
      .filter(([, count]) => count >= 3)
      .map(([email, count]) => ({ email, count }));

    res.json({ totalAttempts: attempts.length, repeatedTargets, recent: attempts.slice(0, 50) });
  }
);

securityRouter.get(
  "/mfa-status",
  requireAuth,
  requireRole("ICT_ADMIN", "SUPER_ADMIN", "AUDITOR"),
  async (_req: AuthedRequest, res) => {
    const users = await prisma.user.findMany({ select: { id: true, email: true, role: true, mfaEnabled: true, isActive: true } });
    const withoutMfa = users.filter((u) => !u.mfaEnabled && u.isActive);
    res.json({ totalActiveUsers: users.filter((u) => u.isActive).length, withoutMfaCount: withoutMfa.length, withoutMfa });
  }
);

// ---------------------------------------------------------------------------
// AD032 — API management: real issued keys, hashed at rest (only the raw
// key is ever shown, once, at creation — exactly like a real API key
// system, not a stored plaintext secret), with real usage tracking.
// ---------------------------------------------------------------------------
const apiKeySchema = z.object({ label: z.string().min(2) });

securityRouter.post(
  "/api-keys",
  requireAuth,
  requireRole("ICT_ADMIN", "SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    const parsed = apiKeySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Provide a label." });

    const rawKey = `kvbdtc_${crypto.randomBytes(24).toString("hex")}`;
    const keyHash = crypto.createHash("sha256").update(rawKey).digest("hex");

    const key = await prisma.apiKey.create({
      data: { label: parsed.data.label, keyHash, createdById: req.user!.id },
    });

    // The raw key is returned exactly once — it is not recoverable after this response.
    res.status(201).json({ id: key.id, label: key.label, rawKey, createdAt: key.createdAt });
  }
);

securityRouter.get(
  "/api-keys",
  requireAuth,
  requireRole("ICT_ADMIN", "SUPER_ADMIN"),
  async (_req: AuthedRequest, res) => {
    const keys = await prisma.apiKey.findMany({ orderBy: { createdAt: "desc" } });
    res.json(keys.map((k) => ({ id: k.id, label: k.label, createdAt: k.createdAt, revokedAt: k.revokedAt, lastUsedAt: k.lastUsedAt })));
  }
);

securityRouter.patch(
  "/api-keys/:id/revoke",
  requireAuth,
  requireRole("ICT_ADMIN", "SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    const key = await prisma.apiKey.update({ where: { id: req.params.id }, data: { revokedAt: new Date() } });
    res.json(key);
  }
);
