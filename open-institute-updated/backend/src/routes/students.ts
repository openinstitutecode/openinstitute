import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { pagedWindow } from "../lib/batch73.js";
import { requireAuth, requireRole, AuthedRequest } from "../middleware/auth.js";

export const studentsRouter = Router();

studentsRouter.get(
  "/",
  requireAuth,
  requireRole("REGISTRAR", "ADMISSIONS_OFFICER", "FINANCE_OFFICER", "SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    const q = typeof req.query.q === "string" ? req.query.q : undefined;
    const win = pagedWindow(req.query, 200);
    const students = await prisma.student.findMany({
      where: q
        ? {
            OR: [
              { fullName: { contains: q, mode: "insensitive" } },
              { studentNumber: { contains: q, mode: "insensitive" } },
            ],
          }
        : undefined,
      include: {
        programme: true,
        feeInvoices: true,
      },
      orderBy: { createdAt: "desc" },
      skip: win.skip, take: win.take,
    });
    if (win.paged) res.setHeader("X-Total-Count", String(await prisma.student.count({ where: q ? { OR: [{ fullName: { contains: q, mode: "insensitive" } }, { studentNumber: { contains: q, mode: "insensitive" } }] } : undefined })));

    const withBalance = students.map((s) => ({
      id: s.id,
      studentNumber: s.studentNumber,
      fullName: s.fullName,
      programme: s.programme.name,
      academicStatus: s.academicStatus,
      balance: s.feeInvoices.reduce((sum, inv) => sum + Number(inv.amountDue) - Number(inv.amountPaid), 0),
    }));

    res.json(withBalance);
  }
);

studentsRouter.get(
  "/:id",
  requireAuth,
  requireRole("REGISTRAR", "ADMISSIONS_OFFICER", "FINANCE_OFFICER", "TRAINER", "SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    const student = await prisma.student.findUnique({
      where: { id: req.params.id },
      include: { programme: true, enrollments: { include: { unit: true } } },
    });
    if (!student) return res.status(404).json({ message: "Student not found." });
    res.json(student);
  }
);
