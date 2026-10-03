// Batch 69 — KFEAT-066 (flags) · KFEAT-070 (branding) · KFEAT-073 (academic rules) · KFEAT-059 (KPI targets) · KDATA-005 (privacy notice)
import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireRole, AuthedRequest } from "../middleware/auth.js";
import { SETTING_SCHEMAS, SETTING_DEFAULTS, PUBLIC_SETTING_KEYS, getSetting, isSettingKey, invalidateSettings } from "../lib/settings.js";

export const settingsRouter = Router();

// Public: safe subset only (flags, branding, privacy notice) so the login page and footer can use it.
settingsRouter.get("/public", async (_req, res) => {
  const entries = await Promise.all(PUBLIC_SETTING_KEYS.map(async (k) => [k, await getSetting(k)] as const));
  res.json(Object.fromEntries(entries));
});

settingsRouter.get("/", requireAuth, requireRole("SUPER_ADMIN", "ICT_ADMIN", "PRINCIPAL"), async (_req, res) => {
  const rows = await prisma.systemSetting.findMany();
  const updated = new Map(rows.map((r) => [r.key, r]));
  const keys = Object.keys(SETTING_SCHEMAS) as (keyof typeof SETTING_SCHEMAS)[];
  res.json(await Promise.all(keys.map(async (k) => ({ key: k, value: await getSetting(k), isDefault: !updated.has(k), defaultValue: SETTING_DEFAULTS[k], updatedAt: updated.get(k)?.updatedAt ?? null }))));
});

settingsRouter.put("/:key", requireAuth, requireRole("SUPER_ADMIN", "ICT_ADMIN"), async (req: AuthedRequest, res) => {
  const key = req.params.key;
  if (!isSettingKey(key)) return res.status(404).json({ message: "Unknown setting.", code: "NOT_FOUND" });
  const parsed = SETTING_SCHEMAS[key].safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "That value is not valid for this setting.", code: "BAD_REQUEST", details: parsed.error.issues.slice(0, 5).map((i) => `${i.path.join(".") || "value"}: ${i.message}`) });
  const before = await prisma.systemSetting.findUnique({ where: { key } });
  await prisma.$transaction([
    prisma.systemSetting.upsert({ where: { key }, create: { key, value: parsed.data as object, updatedById: req.user!.id }, update: { value: parsed.data as object, updatedById: req.user!.id } }),
    prisma.auditLog.create({ data: { userId: req.user!.id, action: "SETTING_CHANGED", entityType: "SystemSetting", entityId: key, metadata: { before: before?.value ?? null, after: parsed.data } as object } }),
  ]);
  invalidateSettings();
  res.json({ key, value: parsed.data });
});
