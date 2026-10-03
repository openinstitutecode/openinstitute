// Batch 69 — resolves batch 68's "role lists are guesses": defaults live here, env can override per area,
// and SUPER_ADMIN can still narrow any role with a RolePermission row (resource "INSIGHTS", action = area).
import type { NextFunction, Response } from "express";
import { hasPermission } from "./permissions.js";
import type { AuthedRequest } from "../middleware/auth.js";

export type InsightArea = "finance" | "academic" | "attachments" | "support" | "awards" | "analytics" | "library" | "kpis" | "jobs" | "reconcile" | "privacy" | "security" | "operations";
const TOP = ["SUPER_ADMIN", "PRINCIPAL", "DEPUTY_PRINCIPAL"];
export const DEFAULT_INSIGHT_ROLES: Record<InsightArea, string[]> = {
  finance: [...TOP, "FINANCE_OFFICER", "ACCOUNTANT"],
  reconcile: ["SUPER_ADMIN", "FINANCE_OFFICER", "ACCOUNTANT"],
  academic: [...TOP, "REGISTRAR", "DEPARTMENT_HEAD", "PROGRAMME_COORDINATOR", "QA_OFFICER", "EXAMINATION_OFFICER", "TRAINER"],
  attachments: [...TOP, "ATTACHMENT_OFFICER", "CAREER_OFFICER", "DEPARTMENT_HEAD"],
  support: [...TOP, "REGISTRAR", "QA_OFFICER", "ICT_ADMIN", "COUNSELLOR"],
  awards: [...TOP, "REGISTRAR", "QA_OFFICER", "EXAMINATION_OFFICER", "AUDITOR"],
  analytics: [...TOP, "QA_OFFICER", "REGISTRAR"],
  library: [...TOP, "LIBRARIAN", "QA_OFFICER"],
  kpis: [...TOP, "QA_OFFICER", "REGISTRAR", "FINANCE_OFFICER", "DEPARTMENT_HEAD"],
  jobs: ["SUPER_ADMIN", "ICT_ADMIN", "PRINCIPAL"],
  privacy: ["SUPER_ADMIN", "PRINCIPAL", "REGISTRAR", "QA_OFFICER", "ICT_ADMIN"], // data-request handlers (set your data protection officer's role here via env)
  security: ["SUPER_ADMIN", "ICT_ADMIN", "AUDITOR", "PRINCIPAL"],
  operations: [...TOP, "REGISTRAR", "ADMISSIONS_OFFICER", "FINANCE_OFFICER", "DEPARTMENT_HEAD", "PROGRAMME_COORDINATOR"],
};

/** INSIGHTS_ROLES_FINANCE="SUPER_ADMIN, finance_officer" replaces that area's default list. */
export function rolesFor(area: InsightArea, env: NodeJS.ProcessEnv = process.env): string[] {
  const raw = env[`INSIGHTS_ROLES_${area.toUpperCase()}`];
  if (!raw) return DEFAULT_INSIGHT_ROLES[area];
  const list = raw.split(",").map((r) => r.trim().toUpperCase()).filter(Boolean);
  return list.length ? list : DEFAULT_INSIGHT_ROLES[area];
}

export function requireInsight(area: InsightArea) {
  return async (req: AuthedRequest, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ message: "Not authenticated.", code: "UNAUTHENTICATED" });
    if (!rolesFor(area).includes(req.user.role) || !(await hasPermission(req.user.role, "INSIGHTS", area))) {
      return res.status(403).json({ message: "You don't have permission to do that.", code: "FORBIDDEN" });
    }
    next();
  };
}
