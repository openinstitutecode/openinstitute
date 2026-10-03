// AD033 — Data Import: flexible CSV import for students, results, courses, staff
import { Router, Request, Response } from "express";
import { requireAuth } from "../middleware/auth.js";
import { prisma } from "../lib/prisma.js";
import { parse } from "csv-parse/sync";

const router = Router();

// POST /api/data-import/preview — preview a CSV without committing
router.post("/preview", requireAuth, async (req: Request, res: Response) => {
  const { importType, csvText } = req.body;
  
  // Verify user is admin
  const user = await prisma.user.findUnique({ where: { id: (req as any).user?.id || "" }, select: { role: true } });
  if (user?.role !== "SUPER_ADMIN") {
    return res.status(403).json({ error: "Only admins can import data" });
  }
  
  try {
    if (typeof csvText !== "string" || csvText.length > 5_000_000) return res.status(400).json({ error: "CSV must be text no larger than 5 MB" });
    const rows = parseCsv(csvText);
    if (!rows.length) return res.status(400).json({ error: "CSV must contain a header and at least one data row" });
    const headers = Object.keys(rows[0]);
    
    res.json({
      totalRows: rows.length,
      headers,
      preview: rows.slice(0, 5),
      expectedFields: getExpectedFields(importType)
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to parse CSV" });
  }
});

// POST /api/data-import — execute the import
router.post("/", requireAuth, async (req: Request, res: Response) => {
  const { importType, csvText, fileName } = req.body;
  const userId = (req as any).user?.id || "";
  
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
  if (user?.role !== "SUPER_ADMIN") {
    return res.status(403).json({ error: "Only admins can import data" });
  }
  
  try {
    const supportedTypes = ["students", "results", "staff", "courses"];
    if (!supportedTypes.includes(importType)) return res.status(400).json({ error: "Unsupported import type" });
    if (typeof csvText !== "string" || csvText.length > 5_000_000) return res.status(400).json({ error: "CSV must be text no larger than 5 MB" });
    const rows = parseCsv(csvText);
    if (!rows.length || rows.length > 10_000) return res.status(400).json({ error: "CSV must contain 1 to 10,000 data rows" });
    
    let successRows = 0;
    let errors: any[] = [];
    
    // Route to handler based on type
    if (importType === "students") {
      ({ successRows, errors } = await importStudents(rows));
    } else if (importType === "results") {
      ({ successRows, errors } = await importResults(rows));
    } else if (importType === "staff") {
      ({ successRows, errors } = await importStaff(rows));
    } else if (importType === "courses") {
      ({ successRows, errors } = await importCourses(rows));
    }
    
    // Record session
    const session = await prisma.dataImportSession.create({
      data: {
        importType,
        fileName: typeof fileName === "string" ? fileName.slice(0, 255) : "upload.csv",
        importedBy: userId,
        totalRows: rows.length,
        successRows,
        errorRows: rows.length - successRows,
        status: "completed",
        errorLog: errors.length > 0 ? JSON.stringify(errors) : null,
        completedAt: new Date()
      }
    });
    
    res.json({
      sessionId: session.id,
      totalRows: rows.length,
      successRows,
      errorRows: rows.length - successRows,
      errors: errors.slice(0, 10) // first 10 errors
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to import data" });
  }
});

// GET /api/data-import/sessions — list import sessions
router.get("/sessions", requireAuth, async (req: Request, res: Response) => {
  const user = await prisma.user.findUnique({ where: { id: (req as any).user?.id || "" }, select: { role: true } });
  if (user?.role !== "SUPER_ADMIN") {
    return res.status(403).json({ error: "Only admins can view import sessions" });
  }
  
  try {
    const sessions = await prisma.dataImportSession.findMany({
      include: { importedByUser: { select: { email: true } } },
      orderBy: { createdAt: "desc" },
      take: 20
    });
    res.json(sessions);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch sessions" });
  }
});

// GET /api/data-import/sessions/:id — view session details
router.get("/sessions/:id", requireAuth, async (req: Request, res: Response) => {
  const user = await prisma.user.findUnique({ where: { id: (req as any).user?.id || "" }, select: { role: true } });
  if (user?.role !== "SUPER_ADMIN") {
    return res.status(403).json({ error: "Only admins can view sessions" });
  }
  
  try {
    const session = await prisma.dataImportSession.findUnique({
      where: { id: req.params.id },
      include: { importedByUser: { select: { email: true } } }
    });
    if (!session) return res.status(404).json({ error: "Session not found" });
    
    // Parse error log
    const errorLog = session.errorLog ? JSON.parse(session.errorLog) : [];
    res.json({ ...session, errorLog });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch session" });
  }
});

// =========================================================================
// HELPERS
// =========================================================================

function getExpectedFields(importType: string): string[] {
  const templates: any = {
    results: ["studentEmail", "assessmentId", "score", "totalMarks", "gradedDate"],
    staff: ["email", "firstName", "lastName", "role", "department"],
    courses: ["title", "unitCode", "trainerEmail", "description"],
    students: ["admissionNumber", "studentNumber", "email", "firstName", "lastName", "programmeSlug", "enrollmentYear", "studyMode"],
  };
  return templates[importType] || [];
}

function parseCsv(csvText: string): Record<string, string>[] {
  const rows = parse(csvText, { columns: true, bom: true, skip_empty_lines: true, trim: true, max_record_size: 20_000 }) as Record<string, string>[];
  if (rows.length && Object.keys(rows[0]).some((header) => !header || header.length > 100)) throw new Error("CSV contains an invalid column name");
  return rows;
}

async function importStudents(rows: any[]) {
  let successRows = 0;
  const errors = [];
  
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    try {
      const programme = await prisma.programme.findUnique({ where: { slug: row.programmeSlug } });
      if (!programme) throw new Error("Programme not found");
      
      const user = await prisma.user.findUnique({ where: { email: row.email } });
      if (!user || user.role !== "STUDENT") throw new Error("A student account must exist before importing its academic record");
      const student = await prisma.student.create({
        data: {
          admissionNumber: row.admissionNumber,
          studentNumber: row.studentNumber || row.admissionNumber,
          fullName: `${row.firstName} ${row.lastName}`.trim(),
          userId: user.id,
          programmeId: programme.id,
          intake: String(row.enrollmentYear || new Date().getFullYear()),
          studyMode: row.studyMode || "FULL_TIME",
        }
      });
      successRows++;
    } catch (error: any) {
      errors.push({ row: i + 1, error: error.message });
    }
  }
  return { successRows, errors };
}

async function importResults(rows: any[]) {
  let successRows = 0;
  const errors = [];
  
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    try {
      const student = await prisma.student.findFirst({
        where: { user: { email: row.studentEmail } }
      });
      if (!student) throw new Error("Student not found");
      
      const assessment = await prisma.assessment.findUnique({
        where: { id: row.assessmentId }
      });
      if (!assessment) throw new Error("Assessment not found");
      
      const submission = await prisma.submission.findFirst({
        where: {
          assessmentId: row.assessmentId,
          studentUserId: student.userId
        }
      });
      
      if (!submission) throw new Error("No submission exists for this student and assessment; imports do not fabricate assessed work");
      const score = Number(row.score);
      if (!Number.isFinite(score) || score < 0 || score > assessment.totalMarks) throw new Error("Score must be between zero and the assessment maximum");
      await prisma.submission.update({
        where: { id: submission.id },
        data: { score, gradedAt: row.gradedDate ? new Date(row.gradedDate) : new Date() }
      });
      successRows++;
    } catch (error: any) {
      errors.push({ row: i + 1, error: error.message });
    }
  }
  return { successRows, errors };
}

async function importStaff(rows: any[]) {
  let successRows = 0;
  const errors = [];
  
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    try {
      const user = await prisma.user.findUnique({ where: { email: row.email } });
      if (!user) throw new Error("Create and verify the account before importing staff records");
      const allowedRoles = ["TRAINER", "REGISTRAR", "FINANCE_OFFICER", "ACCOUNTANT", "LIBRARIAN", "QA_OFFICER", "HR_OFFICER", "ICT_ADMIN", "PROGRAMME_COORDINATOR", "ATTACHMENT_OFFICER", "ADMISSIONS_OFFICER", "EXAMINATION_OFFICER"];
      if (!allowedRoles.includes(row.role)) throw new Error("Staff import role is not allowed");
      if (user.role !== row.role) await prisma.user.update({ where: { id: user.id }, data: { role: row.role as any } });
      await prisma.staffProfile.upsert({
        where: { userId: user.id },
        create: { userId: user.id, fullName: `${row.firstName} ${row.lastName}`.trim(), department: row.department || null, title: row.title || null },
        update: { fullName: `${row.firstName} ${row.lastName}`.trim(), department: row.department || null, title: row.title || null },
      });
      successRows++;
    } catch (error: any) {
      errors.push({ row: i + 1, error: error.message });
    }
  }
  return { successRows, errors };
}

async function importCourses(rows: any[]) {
  let successRows = 0;
  const errors = [];
  
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    try {
      const unit = await prisma.unit.findFirst({ where: { code: row.unitCode || row.unitSlug } });
      if (!unit) throw new Error("Unit not found");
      
      const trainer = await prisma.trainer.findFirst({
        where: { user: { email: row.trainerEmail } }
      });
      if (!trainer) throw new Error("Trainer account not found");
      
      const course = await prisma.course.create({
        data: {
          unitId: unit.id,
          trainerId: trainer.id,
          title: row.title,
          description: row.description
        }
      });
      successRows++;
    } catch (error: any) {
      errors.push({ row: i + 1, error: error.message });
    }
  }
  return { successRows, errors };
}

export default router;
