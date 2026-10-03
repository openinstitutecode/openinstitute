// Batch 69 — KUX-014: one search box across what the caller is allowed to find.
import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth, AuthedRequest } from "../middleware/auth.js";

export const searchRouter = Router();
const STUDENT_DATA_ROLES = new Set(["SUPER_ADMIN", "PRINCIPAL", "DEPUTY_PRINCIPAL", "REGISTRAR", "ADMISSIONS_OFFICER", "DEPARTMENT_HEAD", "PROGRAMME_COORDINATOR", "FINANCE_OFFICER", "ACCOUNTANT"]);
const contains = (q: string) => ({ contains: q, mode: "insensitive" as const });

searchRouter.get("/", requireAuth, async (req: AuthedRequest, res) => {
  const q = String(req.query.q ?? "").trim().slice(0, 60);
  if (q.length < 2) return res.json({ q, results: [] });
  const { id, role } = req.user!;
  type R = { type: string; title: string; subtitle?: string; url: string };
  const jobs: Promise<R[]>[] = [
    prisma.programme.findMany({ where: { OR: [{ name: contains(q) }, { slug: contains(q) }] }, select: { name: true, slug: true }, take: 5 })
      .then((rows) => rows.map((p) => ({ type: "Programme", title: p.name, url: `/programmes/${p.slug}` }))),
    prisma.libraryResource.findMany({ where: { OR: [{ title: contains(q) }, { author: contains(q) }, { subject: contains(q) }] }, select: { title: true, author: true, type: true }, take: 5 })
      .then((rows) => rows.map((r) => ({ type: "Library", title: r.title, subtitle: [r.type, r.author].filter(Boolean).join(" · "), url: role === "STUDENT" ? "/student/library" : "/admin/library" }))),
  ];
  if (role === "STUDENT") {
    jobs.push(prisma.enrollment.findMany({ where: { student: { userId: id }, unit: { OR: [{ title: contains(q) }, { code: contains(q) }] } }, select: { unit: { select: { code: true, title: true } } }, take: 5 })
      .then((rows) => rows.map((e) => ({ type: "My unit", title: e.unit.title, subtitle: e.unit.code, url: "/student/courses" }))));
  } else if (role === "TRAINER") {
    jobs.push(prisma.course.findMany({ where: { trainer: { userId: id }, title: contains(q) }, select: { title: true }, take: 5 })
      .then((rows) => rows.map((c) => ({ type: "My course", title: c.title, url: "/trainer/courses" }))));
  }
  if (STUDENT_DATA_ROLES.has(role)) {
    jobs.push(prisma.student.findMany({ where: { OR: [{ fullName: contains(q) }, { studentNumber: contains(q) }, { admissionNumber: contains(q) }] }, select: { fullName: true, studentNumber: true, academicStatus: true }, take: 8 })
      .then((rows) => rows.map((s) => ({ type: "Student", title: s.fullName, subtitle: `${s.studentNumber} · ${s.academicStatus}`, url: "/admin/students" }))));
  }
  const results = (await Promise.all(jobs.map((j) => j.catch(() => [] as R[])))).flat();
  res.json({ q, results });
});
