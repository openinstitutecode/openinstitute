import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { JWT_SECRET } from "./auth.js";

type Scope = { prefix: string; roles: readonly string[] };

const admissions = ["ADMISSIONS_OFFICER", "REGISTRAR", "SUPER_ADMIN"] as const;
const finance = ["FINANCE_OFFICER", "ACCOUNTANT", "PRINCIPAL", "DEPUTY_PRINCIPAL", "REGISTRAR", "ICT_ADMIN", "SUPER_ADMIN"] as const;
const staffManagement = ["HR_OFFICER", "PRINCIPAL", "ICT_ADMIN", "SUPER_ADMIN"] as const;
const adminScopes: Scope[] = [
  { prefix: "/applications", roles: admissions },
  { prefix: "/finance", roles: finance },
  { prefix: "/ledger", roles: finance },
  { prefix: "/budgets", roles: finance },
  { prefix: "/inventory", roles: finance },
  { prefix: "/procurement", roles: finance },
  { prefix: "/fee-structure", roles: finance },
  { prefix: "/receivable-payable", roles: finance },
  { prefix: "/installments", roles: finance },
  { prefix: "/financial-planning", roles: finance },
  { prefix: "/staff", roles: staffManagement },
  { prefix: "/departments", roles: ["HR_OFFICER", "PRINCIPAL", "DEPARTMENT_HEAD", "SUPER_ADMIN"] },
  { prefix: "/tasks", roles: ["HR_OFFICER", "PRINCIPAL", "DEPARTMENT_HEAD", "REGISTRAR", "SUPER_ADMIN"] },
  { prefix: "/communication", roles: ["HR_OFFICER", "PRINCIPAL", "REGISTRAR", "ICT_ADMIN", "SUPER_ADMIN"] },
  { prefix: "/timetable-admin", roles: ["PRINCIPAL", "REGISTRAR", "DEPARTMENT_HEAD", "PROGRAMME_COORDINATOR", "SUPER_ADMIN"] },
  { prefix: "/documents", roles: ["REGISTRAR", "ADMISSIONS_OFFICER", "HR_OFFICER", "QA_OFFICER", "ICT_ADMIN", "SUPER_ADMIN"] },
  { prefix: "/compliance", roles: ["QA_OFFICER", "PRINCIPAL", "REGISTRAR", "PROGRAMME_COORDINATOR", "HR_OFFICER", "AUDITOR", "REGULATORY_INSPECTOR", "SUPER_ADMIN"] },
  { prefix: "/exam-security", roles: ["EXAMINATION_OFFICER", "TRAINER", "DEPARTMENT_HEAD", "PROGRAMME_COORDINATOR", "SUPER_ADMIN"] },
  { prefix: "/institutional-analytics", roles: ["PRINCIPAL", "DEPUTY_PRINCIPAL", "REGISTRAR", "FINANCE_OFFICER", "QA_OFFICER", "SUPER_ADMIN"] },
  { prefix: "/academic-statistics", roles: ["PRINCIPAL", "REGISTRAR", "QA_OFFICER", "SUPER_ADMIN"] },
  { prefix: "/decision-centre", roles: ["PRINCIPAL", "DEPUTY_PRINCIPAL", "SUPER_ADMIN"] },
  { prefix: "/trainers", roles: ["HR_OFFICER", "PRINCIPAL", "QA_OFFICER", "SUPER_ADMIN"] },
  { prefix: "/users", roles: ["ICT_ADMIN", "HR_OFFICER", "SUPER_ADMIN"] },
  { prefix: "/role-permissions", roles: ["ICT_ADMIN", "SUPER_ADMIN"] },
  { prefix: "/permission-audit", roles: ["AUDITOR", "SUPER_ADMIN"] },
  { prefix: "/audit", roles: ["AUDITOR", "REGULATORY_INSPECTOR", "ICT_ADMIN", "SUPER_ADMIN"] },
  { prefix: "/security", roles: ["ICT_ADMIN", "AUDITOR", "SUPER_ADMIN"] },
  { prefix: "/data-export", roles: ["ICT_ADMIN", "REGISTRAR", "ADMISSIONS_OFFICER", "HR_OFFICER", "PROGRAMME_COORDINATOR", "EXAMINATION_OFFICER", "SUPER_ADMIN"] },
  { prefix: "/data-import", roles: ["ICT_ADMIN", "SUPER_ADMIN"] },
  { prefix: "/students", roles: ["REGISTRAR", "ADMISSIONS_OFFICER", "FINANCE_OFFICER", "TRAINER", "SUPER_ADMIN"] },
  { prefix: "/command-centre", roles: ["PRINCIPAL", "DEPUTY_PRINCIPAL", "REGISTRAR", "SUPER_ADMIN"] },
  { prefix: "/governance", roles: ["BOARD_MEMBER", "PRINCIPAL", "REGISTRAR", "QA_OFFICER", "EXAMINATION_OFFICER", "SUPER_ADMIN"] },
  { prefix: "/reports", roles: ["PRINCIPAL", "REGISTRAR", "FINANCE_OFFICER", "ACCOUNTANT", "QA_OFFICER", "AUDITOR", "SUPER_ADMIN"] },
];

function matches(path: string, prefix: string) {
  return path === prefix || path.startsWith(`${prefix}/`);
}

export function roleAllowedForScope(role: string, path: string): boolean {
  if (role === "STUDENT" && /^\/applications\/files\/[^/]+$/.test(path)) return true;
  if (matches(path, "/students")) {
    if (role === "TRAINER") return !["/students", "/students/"].includes(path);
    return ["REGISTRAR", "ADMISSIONS_OFFICER", "FINANCE_OFFICER", "SUPER_ADMIN"].includes(role);
  }
  const scope = adminScopes.find((item) => matches(path, item.prefix));
  return !scope || scope.roles.includes(role);
}

/** Role-scoped API guard so a broad authenticated route cannot cross departments. */
export function enforceRoleScope(req: Request, res: Response, next: NextFunction) {
  const authorization = req.headers.authorization;
  if (!authorization?.startsWith("Bearer ")) return next();

  try {
    const payload = jwt.verify(authorization.slice(7), JWT_SECRET) as { role?: string };
    if (!payload.role) return next();
    if (!roleAllowedForScope(payload.role, req.path)) {
      return res.status(403).json({ message: "Your assigned role does not have access to this department." });
    }
  } catch {
    // Individual protected routes return the usual invalid-token response.
  }
  return next();
}
