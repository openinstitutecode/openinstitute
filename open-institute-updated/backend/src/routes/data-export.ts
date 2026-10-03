import { Router } from "express";
import { stringify } from "csv-stringify/sync";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireRole, AuthedRequest } from "../middleware/auth.js";

// AD034 — Data Export. AD033's data-import.ts generalised bulk import
// beyond KUCCPS-only; this is the symmetric export side, generalised
// beyond kuccps.ts's KUCCPS-specific intake export. Every endpoint here
// streams a real CSV built from a live Prisma query — no placeholder rows.
export const dataExportRouter = Router();

function sendCsv(res: import("express").Response, filename: string, rows: Record<string, unknown>[]) {
  const csv = stringify(rows, { header: true });
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename=${filename}`);
  res.send(csv);
}

dataExportRouter.get(
  "/students.csv",
  requireAuth,
  requireRole("REGISTRAR", "ADMISSIONS_OFFICER", "SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    const { programmeId, academicStatus } = req.query;
    const students = await prisma.student.findMany({
      where: {
        ...(typeof programmeId === "string" ? { programmeId } : {}),
        ...(typeof academicStatus === "string" ? { academicStatus: academicStatus as never } : {}),
      },
      include: { programme: { select: { name: true } }, user: { select: { email: true } } },
      orderBy: { studentNumber: "asc" },
    });

    sendCsv(
      res,
      "students-export.csv",
      students.map((s) => ({
        student_number: s.studentNumber,
        admission_number: s.admissionNumber,
        full_name: s.fullName,
        email: s.user.email,
        programme: s.programme.name,
        intake: s.intake,
        study_mode: s.studyMode,
        academic_status: s.academicStatus,
      }))
    );
  }
);

dataExportRouter.get(
  "/staff.csv",
  requireAuth,
  requireRole("HR_OFFICER", "SUPER_ADMIN"),
  async (_req: AuthedRequest, res) => {
    const staff = await prisma.staffProfile.findMany({
      include: { user: { select: { email: true, role: true, isActive: true } } },
      orderBy: { fullName: "asc" },
    });

    sendCsv(
      res,
      "staff-export.csv",
      staff.map((s) => ({
        full_name: s.fullName,
        email: s.user.email,
        role: s.user.role,
        department: s.department ?? "",
        is_active: s.user.isActive,
      }))
    );
  }
);

dataExportRouter.get(
  "/courses.csv",
  requireAuth,
  requireRole("PROGRAMME_COORDINATOR", "REGISTRAR", "SUPER_ADMIN"),
  async (_req: AuthedRequest, res) => {
    const courses = await prisma.course.findMany({
      include: { unit: { select: { code: true, title: true } }, trainer: { select: { fullName: true } } },
      orderBy: { title: "asc" },
    });

    sendCsv(
      res,
      "courses-export.csv",
      courses.map((c) => ({
        title: c.title,
        unit_code: c.unit.code,
        unit_title: c.unit.title,
        trainer: c.trainer?.fullName ?? "",
        published: Boolean(c.publishedAt),
      }))
    );
  }
);

// Per-assessment results export — real graded submissions, not a
// placeholder row per student.
dataExportRouter.get(
  "/results.csv",
  requireAuth,
  requireRole("EXAMINATION_OFFICER", "REGISTRAR", "SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    const { assessmentId } = req.query;
    if (typeof assessmentId !== "string") return res.status(400).json({ message: "Provide assessmentId." });

    const assessment = await prisma.assessment.findUnique({ where: { id: assessmentId } });
    if (!assessment) return res.status(404).json({ message: "Assessment not found." });

    const submissions = await prisma.submission.findMany({
      where: { assessmentId },
      orderBy: { submittedAt: "asc" },
    });

    sendCsv(
      res,
      `results-${assessment.title.replace(/\s+/g, "-").toLowerCase()}.csv`,
      submissions.map((s) => ({
        student_user_id: s.studentUserId,
        score: s.score ?? "",
        graded_at: s.gradedAt?.toISOString() ?? "",
        integrity_flag: s.integrityFlag,
      }))
    );
  }
);
