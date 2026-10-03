// Batch 69 — KFEAT-066/070/073/059: validated, admin-editable settings with defaults and a short cache.
import { z } from "zod";
import { prisma } from "./prisma.js";
import { TtlCache } from "./ttl-cache.js";

export const SETTING_SCHEMAS = {
  "feature.flags": z.record(z.string().regex(/^[a-z][a-z0-9._-]{0,60}$/), z.boolean()),
  branding: z.object({ institutionName: z.string().min(2).max(120), tagline: z.string().max(200).optional(), primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/), supportEmail: z.string().email().optional(), footerText: z.string().max(300).optional() }),
  "kpi.targets": z.object({ collectionRatePercent: z.number().min(0).max(100), retentionPercent: z.number().min(0).max(100), passRatePercent: z.number().min(0).max(100), maxOpenTickets: z.number().int().min(0).max(100000) }),
  "academic.rules": z.object({ passMarkPercent: z.number().min(0).max(100), lateSubmissionPenaltyPercent: z.number().min(0).max(100), maxAttemptsDefault: z.number().int().min(1).max(20) }),
  "finance.limits": z.object({ refundApprovalLimitKes: z.number().min(0).max(100_000_000) }),
  "privacy.notice": z.object({ version: z.string().min(1).max(20), url: z.string().url().optional(), summary: z.string().min(10).max(2000) }),
} as const;
export type SettingKey = keyof typeof SETTING_SCHEMAS;

export const SETTING_DEFAULTS: { [K in SettingKey]: z.infer<(typeof SETTING_SCHEMAS)[K]> } = {
  "feature.flags": {},
  branding: { institutionName: "Measur Business College", primaryColor: "#1B3A4B" },
  "kpi.targets": { collectionRatePercent: 85, retentionPercent: 90, passRatePercent: 75, maxOpenTickets: 25 },
  "academic.rules": { passMarkPercent: 40, lateSubmissionPenaltyPercent: 10, maxAttemptsDefault: 1 },
  "finance.limits": { refundApprovalLimitKes: 0 },
  "privacy.notice": { version: "0", summary: "Privacy notice not yet published by the institution." },
};
export const PUBLIC_SETTING_KEYS: SettingKey[] = ["feature.flags", "branding", "privacy.notice"];
export const isSettingKey = (k: string): k is SettingKey => Object.prototype.hasOwnProperty.call(SETTING_SCHEMAS, k);

const cache = new TtlCache<unknown>(30_000, 50);
export async function getSetting<K extends SettingKey>(key: K): Promise<z.infer<(typeof SETTING_SCHEMAS)[K]>> {
  return cache.getOrLoad(key, async () => {
    const row = await prisma.systemSetting.findUnique({ where: { key } });
    const parsed = row ? SETTING_SCHEMAS[key].safeParse(row.value) : null;
    return parsed?.success ? parsed.data : SETTING_DEFAULTS[key]; // a corrupt row never breaks callers
  }) as Promise<z.infer<(typeof SETTING_SCHEMAS)[K]>>;
}
export const invalidateSettings = () => cache.invalidate();
