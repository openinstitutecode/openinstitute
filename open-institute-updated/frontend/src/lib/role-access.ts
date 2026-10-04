export type PortalKind = "student" | "trainer" | "admin" | "employer" | "alumni" | "applicant";

const ALL_STAFF = [
  "SUPER_ADMIN",
  "BOARD_MEMBER",
  "PRINCIPAL",
  "DEPUTY_PRINCIPAL",
  "REGISTRAR",
  "FINANCE_OFFICER",
  "ACCOUNTANT",
  "HR_OFFICER",
  "QA_OFFICER",
  "ICT_ADMIN",
  "LIBRARIAN",
  "ADMISSIONS_OFFICER",
  "EXAMINATION_OFFICER",
  "DEPARTMENT_HEAD",
  "PROGRAMME_COORDINATOR",
  "COUNSELLOR",
  "CAREER_OFFICER",
  "ATTACHMENT_OFFICER",
  "EXTERNAL_EXAMINER",
  "AUDITOR",
  "REGULATORY_INSPECTOR",
] as const;

const LEADERSHIP = ["PRINCIPAL", "DEPUTY_PRINCIPAL", "BOARD_MEMBER"] as const;
const FINANCE = ["FINANCE_OFFICER", "ACCOUNTANT"] as const;
const REGISTRY = ["REGISTRAR"] as const;
const ADMISSIONS = ["ADMISSIONS_OFFICER", "REGISTRAR"] as const;
const EXAMS = ["EXAMINATION_OFFICER", "REGISTRAR", "EXTERNAL_EXAMINER"] as const;
const QUALITY = ["QA_OFFICER", "REGULATORY_INSPECTOR"] as const;
const ACADEMIC_LEADS = ["DEPARTMENT_HEAD", "PROGRAMME_COORDINATOR", "REGISTRAR"] as const;
const pathRoles: Record<string, readonly string[]> = {
  "/admin/dashboard": ALL_STAFF,
  "/admin/command-centre": [...LEADERSHIP, "SUPER_ADMIN", "ICT_ADMIN"],
  "/admin/decision-centre": [...LEADERSHIP, "SUPER_ADMIN"],
  "/admin/institutional-analytics": [...LEADERSHIP, "SUPER_ADMIN", "REGISTRAR", "QA_OFFICER"],
  "/admin/reports": [...LEADERSHIP, "SUPER_ADMIN", "REGISTRAR", "FINANCE_OFFICER", "ACCOUNTANT", "AUDITOR", "QA_OFFICER"],
  "/admin/admin-assistant": ["SUPER_ADMIN", "PRINCIPAL", "DEPUTY_PRINCIPAL", "ICT_ADMIN"],
  "/admin/ai-governance": ["SUPER_ADMIN", "ICT_ADMIN", "QA_OFFICER"],
  "/admin/admissions": ["SUPER_ADMIN", ...ADMISSIONS],
  "/admin/students": ["SUPER_ADMIN", ...ADMISSIONS, ...REGISTRY, "COUNSELLOR", "ATTACHMENT_OFFICER"],
  "/admin/registry": ["SUPER_ADMIN", ...REGISTRY, ...ADMISSIONS, ...EXAMS, "ATTACHMENT_OFFICER"],
  "/admin/academic-calendar": ["SUPER_ADMIN", ...REGISTRY, ...ACADEMIC_LEADS, "EXAMINATION_OFFICER"],
  "/admin/timetable-admin": ["SUPER_ADMIN", ...REGISTRY, ...ACADEMIC_LEADS, "EXAMINATION_OFFICER"],
  "/admin/semesters": ["SUPER_ADMIN", "ICT_ADMIN", "PRINCIPAL", ...REGISTRY],
  "/admin/curriculum": ["SUPER_ADMIN", ...ACADEMIC_LEADS],
  "/admin/courses": ["SUPER_ADMIN", "ICT_ADMIN", "PRINCIPAL", ...ACADEMIC_LEADS, ...REGISTRY],
  "/admin/exams": ["SUPER_ADMIN", ...EXAMS, ...QUALITY],
  "/admin/results-approval": ["SUPER_ADMIN", ...EXAMS, ...QUALITY],
  "/admin/graduation": ["SUPER_ADMIN", ...REGISTRY, "PRINCIPAL"],
  "/admin/statistics": ["SUPER_ADMIN", ...LEADERSHIP, ...REGISTRY, ...QUALITY],
  "/admin/qualifications": ["SUPER_ADMIN", ...REGISTRY, ...QUALITY, "REGULATORY_INSPECTOR"],
  "/admin/credit-transfer": ["SUPER_ADMIN", ...REGISTRY, ...ACADEMIC_LEADS],
  "/admin/kuccps": ["SUPER_ADMIN", ...REGISTRY, ...ADMISSIONS],
  "/admin/finance": ["SUPER_ADMIN", ...FINANCE, ...LEADERSHIP],
  "/admin/ledger": ["SUPER_ADMIN", ...FINANCE, "AUDITOR"],
  "/admin/receivable-payable": ["SUPER_ADMIN", ...FINANCE, "AUDITOR"],
  "/admin/installments": ["SUPER_ADMIN", ...FINANCE],
  "/admin/budgets": ["SUPER_ADMIN", ...FINANCE, ...LEADERSHIP],
  "/admin/inventory": ["SUPER_ADMIN", ...FINANCE, "HR_OFFICER"],
  "/admin/financial-planning": ["SUPER_ADMIN", ...FINANCE, ...LEADERSHIP],
  "/admin/fee-structure": ["SUPER_ADMIN", ...FINANCE, "REGISTRAR", "ADMISSIONS_OFFICER"],
  "/admin/procurement": ["SUPER_ADMIN", ...FINANCE, "HR_OFFICER"],
  "/admin/trainers": ["SUPER_ADMIN", "HR_OFFICER", "PRINCIPAL", "DEPUTY_PRINCIPAL"],
  "/admin/staff": ["SUPER_ADMIN", "HR_OFFICER", "PRINCIPAL", "DEPUTY_PRINCIPAL"],
  "/admin/users": ["SUPER_ADMIN", "ICT_ADMIN", "HR_OFFICER"],
  "/admin/role-permissions": ["SUPER_ADMIN"],
  "/admin/settings": ["SUPER_ADMIN", "ICT_ADMIN"],
  "/admin/security": ["SUPER_ADMIN", "ICT_ADMIN", "AUDITOR"],
  "/admin/operations": ["SUPER_ADMIN", "ICT_ADMIN", "AUDITOR"],
  "/admin/insights": ["SUPER_ADMIN", "ICT_ADMIN", "PRINCIPAL"],
  "/admin/permission-audit": ["SUPER_ADMIN", "ICT_ADMIN", "AUDITOR"],
  "/admin/audit-log": ["SUPER_ADMIN", "ICT_ADMIN", "AUDITOR", "PRINCIPAL"],
  "/admin/integrations": ["SUPER_ADMIN", "ICT_ADMIN"],
  "/admin/data-export": ["SUPER_ADMIN", "ICT_ADMIN", "REGISTRAR", ...FINANCE, "AUDITOR"],
  "/admin/data-import": ["SUPER_ADMIN", "ICT_ADMIN", ...REGISTRY, ...ADMISSIONS],
  "/admin/documents": ["SUPER_ADMIN", "ICT_ADMIN", ...REGISTRY, ...ADMISSIONS, ...QUALITY],
  "/admin/library": ["SUPER_ADMIN", "LIBRARIAN", "PRINCIPAL", "DEPUTY_PRINCIPAL"],
  "/admin/library-admin": ["SUPER_ADMIN", "LIBRARIAN"],
  "/admin/compliance": ["SUPER_ADMIN", ...QUALITY, ...LEADERSHIP],
  "/admin/qa-governance": ["SUPER_ADMIN", ...QUALITY, ...LEADERSHIP],
  "/admin/programme-accreditation": ["SUPER_ADMIN", ...ACADEMIC_LEADS, ...QUALITY],
  "/admin/course-evaluations": ["SUPER_ADMIN", ...QUALITY, "HR_OFFICER", "PRINCIPAL", "DEPUTY_PRINCIPAL"],
  "/admin/internal-audits": ["SUPER_ADMIN", "AUDITOR", ...QUALITY],
  "/admin/corrective-actions": ["SUPER_ADMIN", ...QUALITY, ...LEADERSHIP],
  "/admin/governance": ["SUPER_ADMIN", ...LEADERSHIP, "AUDITOR"],
  "/admin/integrity": ["SUPER_ADMIN", ...QUALITY, ...EXAMS, "REGISTRAR"],
  "/admin/appeals": ["SUPER_ADMIN", ...REGISTRY, ...EXAMS, ...QUALITY],
  "/admin/rpl": ["SUPER_ADMIN", ...REGISTRY, ...ACADEMIC_LEADS],
  "/admin/complaints": ["SUPER_ADMIN", ...LEADERSHIP, "REGISTRAR", "COUNSELLOR", "QA_OFFICER"],
  "/admin/research": ["SUPER_ADMIN", ...ACADEMIC_LEADS, "PRINCIPAL"],
  "/admin/departments": ["SUPER_ADMIN", "DEPARTMENT_HEAD", "PRINCIPAL", "DEPUTY_PRINCIPAL"],
  "/admin/support-tickets": ["SUPER_ADMIN", "COUNSELLOR", "REGISTRAR", "ICT_ADMIN"],
  "/admin/communication": ["SUPER_ADMIN", ...LEADERSHIP, "REGISTRAR", "ADMISSIONS_OFFICER", "HR_OFFICER"],
  "/admin/regulatory-reports": ["SUPER_ADMIN", ...QUALITY, "REGISTRAR", ...LEADERSHIP],
  "/admin/exam-security": ["SUPER_ADMIN", ...EXAMS, ...QUALITY, "ICT_ADMIN"],
  "/admin/similarity-checking": ["SUPER_ADMIN", ...EXAMS, ...QUALITY, ...ACADEMIC_LEADS],
  "/admin/knowledge-base": ["SUPER_ADMIN", "ICT_ADMIN", "LIBRARIAN", ...ACADEMIC_LEADS],
  "/admin/notifications": ALL_STAFF,
  "/admin/workflows": ["SUPER_ADMIN", ...LEADERSHIP, "REGISTRAR", "QA_OFFICER"],
  "/admin/virtual-lab": ["SUPER_ADMIN", "ICT_ADMIN", ...ACADEMIC_LEADS],
  "/admin/learning-paths": ["SUPER_ADMIN", ...ACADEMIC_LEADS, "TRAINER"],
};

const portalHome: Record<string, string> = {
  STUDENT: "/student/dashboard",
  TRAINER: "/trainer/dashboard",
  EMPLOYER: "/employer/dashboard",
  ALUMNUS: "/alumni/dashboard",
  APPLICANT: "/admissions",
  FINANCE_OFFICER: "/admin/finance",
  ACCOUNTANT: "/admin/finance",
  REGISTRAR: "/admin/registry",
  ADMISSIONS_OFFICER: "/admin/admissions",
  EXAMINATION_OFFICER: "/admin/exams",
  QA_OFFICER: "/admin/compliance",
  REGULATORY_INSPECTOR: "/admin/regulatory-reports",
  LIBRARIAN: "/admin/library",
  HR_OFFICER: "/admin/staff",
  COUNSELLOR: "/admin/support-tickets",
  ICT_ADMIN: "/admin/command-centre",
  AUDITOR: "/admin/audit-log",
  ATTACHMENT_OFFICER: "/admin/registry",
  CAREER_OFFICER: "/admin/dashboard",
  DEPARTMENT_HEAD: "/admin/curriculum",
  PROGRAMME_COORDINATOR: "/admin/curriculum",
  PRINCIPAL: "/admin/command-centre",
  DEPUTY_PRINCIPAL: "/admin/command-centre",
  BOARD_MEMBER: "/admin/decision-centre",
  EXTERNAL_EXAMINER: "/admin/exams",
  SUPER_ADMIN: "/admin/dashboard",
};

export function rolePortal(role: string | null): PortalKind | null {
  if (role === "STUDENT") return "student";
  if (role === "TRAINER") return "trainer";
  if (role === "EMPLOYER") return "employer";
  if (role === "ALUMNUS") return "alumni";
  if (role === "APPLICANT") return "applicant";
  if (role && (ALL_STAFF as readonly string[]).includes(role)) return "admin";
  return null;
}

export function portalHomeForRole(role: string | null): string {
  return (role && portalHome[role]) || "/login";
}

export function canAccessPath(role: string | null, path: string): boolean {
  if (!role) return false;

  if (path === "/notifications") return rolePortal(role) !== null;
  if (path.startsWith("/transcript/")) return role === "STUDENT";
  if (path.startsWith("/student/")) return role === "STUDENT";
  if (path.startsWith("/trainer/")) return role === "TRAINER";
  if (path.startsWith("/employer/")) return role === "EMPLOYER";
  if (path.startsWith("/alumni/")) return role === "ALUMNUS";
  if (path.startsWith("/admin/")) return (pathRoles[path] ?? []).includes(role);
  return true;
}

export function portalForLoginSelection(role: string): PortalKind | null {
  if (role === "STUDENT") return "student";
  if (role === "TRAINER") return "trainer";
  if (role === "EMPLOYER") return "employer";
  if (role === "ALUMNUS") return "alumni";
  if (role === "APPLICANT") return "applicant";
  if ((ALL_STAFF as readonly string[]).includes(role)) return "admin";
  return null;
}

export function canUseLoginPortal(role: string, portal: string): boolean {
  return portalForLoginSelection(role) === portal;
}
