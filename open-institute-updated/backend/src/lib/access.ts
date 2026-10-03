// Batch 69 — KSEC-007 object-level checks found by `audit-routes.mjs --ownership`.
import { prisma } from "./prisma.js";

const RESEARCH_OVERSIGHT = new Set(["SUPER_ADMIN", "PRINCIPAL", "DEPUTY_PRINCIPAL", "DEPARTMENT_HEAD", "PROGRAMME_COORDINATOR", "QA_OFFICER"]);
export const FINANCE_STAFF = new Set(["SUPER_ADMIN", "PRINCIPAL", "DEPUTY_PRINCIPAL", "FINANCE_OFFICER", "ACCOUNTANT", "REGISTRAR"]);
export const REPORT_ROLES = ["PRINCIPAL", "REGISTRAR", "FINANCE_OFFICER", "QA_OFFICER", "SUPER_ADMIN"];
export const PEER_REVIEW_STAFF = new Set(["SUPER_ADMIN", "PRINCIPAL", "DEPUTY_PRINCIPAL", "TRAINER", "QA_OFFICER", "EXAMINATION_OFFICER", "DEPARTMENT_HEAD"]);

/** Pure rule: may this user see/change a research project? Lead, its supervisor, or oversight staff. */
export function canAccessProject(user: { id: string; role: string }, project: { leadUserId: string; supervisorUserId?: string | null }) {
  return project.leadUserId === user.id || project.supervisorUserId === user.id || RESEARCH_OVERSIGHT.has(user.role);
}
export async function loadProjectAccess(user: { id: string; role: string }, projectId: string): Promise<"ok" | "missing" | "denied"> {
  const p = await prisma.researchProject.findUnique({ where: { id: projectId }, select: { leadUserId: true, supervisor: { select: { userId: true } } } });
  if (!p) return "missing";
  return canAccessProject(user, { leadUserId: p.leadUserId, supervisorUserId: p.supervisor?.userId }) ? "ok" : "denied";
}
