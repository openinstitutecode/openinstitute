import { FormEvent, useEffect, useState } from "react";
import PortalShell from "../../components/portal/PortalShell";
import { PortalSection, Badge } from "../../components/portal/Primitives";
import { apiFetch, useCurrentUserName } from "../../lib/api";

const links = [
  { to: "/admin/dashboard", label: "Dashboard" },
  { to: "/admin/command-centre", label: "Command Centre" },
  { to: "/admin/admissions", label: "Admissions" },
  { to: "/admin/students", label: "Students" },
  { to: "/admin/staff", label: "Staff Management" },
  { to: "/admin/academic-calendar", label: "Academic Calendar" },
  { to: "/admin/timetable-admin", label: "Timetable Management" },
  { to: "/admin/communication", label: "Communication Centre" },
  { to: "/admin/permission-audit", label: "Permission Audit" },
  { to: "/admin/security", label: "Security Centre" },
  { to: "/admin/reports", label: "Report Builder" },
  { to: "/admin/admin-assistant", label: "AI Admin Assistant" },
  { to: "/admin/ai-governance", label: "AI Governance Centre" },
  { to: "/admin/registry", label: "Registry Actions" },
  { to: "/admin/statistics", label: "Academic Statistics" },
  { to: "/admin/qualifications", label: "Qualification Register" },
  { to: "/admin/exams", label: "Examinations" },
  { to: "/admin/results-approval", label: "Results Approval" },
  { to: "/admin/curriculum", label: "Curriculum" },
  { to: "/admin/library", label: "Digital Library" },
  { to: "/admin/library-admin", label: "Library Administration" },
  { to: "/admin/finance", label: "Finance" },
  { to: "/admin/ledger", label: "General Ledger" },
  { to: "/admin/receivable-payable", label: "AR / AP" },
  { to: "/admin/installments", label: "Installment Plans" },
  { to: "/admin/budgets", label: "Budgets" },
  { to: "/admin/inventory", label: "Inventory" },
  { to: "/admin/financial-planning", label: "Financial Planning" },
  { to: "/admin/fee-structure", label: "Fee Structure" },
  { to: "/admin/procurement", label: "Procurement & Assets" },
  { to: "/admin/compliance", label: "Compliance & QA" },
  { to: "/admin/qa-governance", label: "QA Governance" },
  { to: "/admin/course-evaluations", label: "Course & Trainer Evaluations" },
  { to: "/admin/internal-audits", label: "Internal Audits" },
  { to: "/admin/corrective-actions", label: "Corrective Actions" },
  { to: "/admin/complaints", label: "Complaints" },
  { to: "/admin/governance", label: "Governance" },
  { to: "/admin/integrity", label: "Academic Integrity" },
  { to: "/admin/appeals", label: "Appeals" },
  { to: "/admin/rpl", label: "RPL Applications" },
  { to: "/admin/graduation", label: "Graduation Audit" },
  { to: "/admin/kuccps", label: "KUCCPS Exchange" },
  { to: "/admin/users", label: "Users & RBAC" },
  { to: "/admin/audit-log", label: "Audit Log" },
  { to: "/admin/operations", label: "Operations & Data Governance" },
  { to: "/admin/departments", label: "Departments & Tasks" },
  { to: "/admin/research", label: "Research & Innovation" },
  { to: "/admin/trainers", label: "Trainers & HR" },
  { to: "/admin/support-tickets", label: "Support Tickets" },
  { to: "/admin/documents", label: "Document Management" },
  { to: "/admin/data-export", label: "Data Export" },
  { to: "/admin/data-import", label: "Data Import" },
  { to: "/admin/integrations", label: "Integration Centre" },
  { to: "/admin/role-permissions", label: "Role Permissions" },
  { to: "/admin/semesters", label: "Semester Management" },
  { to: "/admin/programme-accreditation", label: "Programme Accreditation" },
  { to: "/admin/credit-transfer", label: "Credit Transfer" },
  { to: "/admin/exam-security", label: "Exam Security" },
  { to: "/admin/similarity-checking", label: "Similarity Checking" },
  { to: "/admin/knowledge-base", label: "Knowledge Base" },
  { to: "/admin/notifications", label: "Notifications" },
  { to: "/admin/workflows", label: "Workflow Engine" },
  { to: "/admin/institutional-analytics", label: "Institutional Analytics" },
  { to: "/admin/decision-centre", label: "Executive Decision Centre" },
];

type Department = { id: string; name: string };
type TaskRow = { id: string; title: string; status: string; dueDate: string | null; assignedToId: string };

export default function AdminDepartments() {
  const userName = useCurrentUserName();
  const [departments, setDepartments] = useState<Department[] | null>(null);
  const [deptName, setDeptName] = useState("");
  const [tasks, setTasks] = useState<TaskRow[] | null>(null);
  const [taskTitle, setTaskTitle] = useState("");
  const [assignedToId, setAssignedToId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [error, setError] = useState<string | null>(null);

  function loadDepartments() {
    apiFetch<Department[]>("/departments").then(setDepartments).catch(() => setDepartments([]));
  }
  function loadTasks() {
    apiFetch<TaskRow[]>("/tasks/assigned-to-me").then(setTasks).catch(() => setTasks([]));
  }
  useEffect(() => {
    loadDepartments();
    loadTasks();
  }, []);

  async function addDepartment(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await apiFetch("/departments", { method: "POST", body: JSON.stringify({ name: deptName }) });
      setDeptName("");
      loadDepartments();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create department.");
    }
  }

  async function addTask(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await apiFetch("/tasks", {
        method: "POST",
        body: JSON.stringify({
          title: taskTitle,
          assignedToId,
          dueDate: dueDate ? new Date(dueDate).toISOString() : undefined,
        }),
      });
      setTaskTitle("");
      setAssignedToId("");
      setDueDate("");
      loadTasks();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create task.");
    }
  }

  async function markDone(id: string) {
    try {
      await apiFetch(`/tasks/${id}/status`, { method: "PATCH", body: JSON.stringify({ status: "done" }) });
      loadTasks();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update task.");
    }
  }

  return (
    <PortalShell role="Admin portal" links={links} userName={userName}>
      <h1 className="font-display text-2xl">Departments &amp; tasks</h1>
      {error && <p className="mt-4 text-sm text-navy-dark">{error}</p>}

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <PortalSection title="Departments">
          <ul className="divide-y divide-line">
            {departments?.map((d) => (
              <li key={d.id} className="py-2 text-sm">{d.name}</li>
            ))}
            {departments && departments.length === 0 && <p className="text-sm text-ink/50">No departments yet.</p>}
          </ul>
          <form onSubmit={addDepartment} className="mt-4 flex gap-2">
            <input value={deptName} onChange={(e) => setDeptName(e.target.value)} placeholder="Department name" className="input flex-1" />
            <button type="submit" className="btn-secondary shrink-0">Add</button>
          </form>
        </PortalSection>

        <PortalSection title="Institutional tasks assigned to you">
          <ul className="divide-y divide-line">
            {tasks?.map((t) => (
              <li key={t.id} className="flex items-center justify-between py-3 text-sm">
                <div>
                  <p>{t.title}</p>
                  {t.dueDate && <p className="text-xs text-ink/45">Due {new Date(t.dueDate).toLocaleDateString()}</p>}
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={t.status === "done" ? "ok" : "warn"}>{t.status.replace("_", " ")}</Badge>
                  {t.status !== "done" && (
                    <button onClick={() => markDone(t.id)} className="text-xs font-medium text-forest hover:underline">
                      Mark done
                    </button>
                  )}
                </div>
              </li>
            ))}
            {tasks && tasks.length === 0 && <p className="text-sm text-ink/50">Nothing assigned to you.</p>}
          </ul>

          <form onSubmit={addTask} className="mt-4 space-y-2">
            <input required value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} placeholder="Task title" className="input" />
            <input required value={assignedToId} onChange={(e) => setAssignedToId(e.target.value)} placeholder="Assign to (user ID)" className="input" />
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="input" />
            <button type="submit" className="btn-secondary w-full justify-center">Create task</button>
          </form>
        </PortalSection>
      </div>
    </PortalShell>
  );
}
