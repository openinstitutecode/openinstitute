import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { pagedWindow } from "../lib/batch73.js";
import { requireAuth, requireRole, AuthedRequest } from "../middleware/auth.js";
import { validatePassword, bcryptRounds } from "../lib/password-policy.js";

export const usersRouter = Router();

usersRouter.get(
  "/",
  requireAuth,
  requireRole("ICT_ADMIN", "SUPER_ADMIN", "HR_OFFICER"),
  async (req: AuthedRequest, res) => {
    const win = pagedWindow(req.query, 300);
    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        phone: true,
        role: true,
        isActive: true,
        lastLoginAt: true,
        createdAt: true,
        staff: { select: { staffNumber: true } },
        trainer: { select: { staffNumber: true } },
        student: { select: { studentNumber: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: win.skip, take: win.take,
    });
    if (win.paged) res.setHeader("X-Total-Count", String(await prisma.user.count()));
    res.json(users);
  }
);

const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum([
    "SUPER_ADMIN", "BOARD_MEMBER", "PRINCIPAL", "DEPUTY_PRINCIPAL", "REGISTRAR",
    "FINANCE_OFFICER", "ACCOUNTANT", "HR_OFFICER", "QA_OFFICER", "ICT_ADMIN",
    "LIBRARIAN", "ADMISSIONS_OFFICER", "EXAMINATION_OFFICER", "DEPARTMENT_HEAD",
    "PROGRAMME_COORDINATOR", "TRAINER", "COUNSELLOR", "CAREER_OFFICER",
    "ATTACHMENT_OFFICER", "STUDENT", "APPLICANT", "ALUMNUS", "EXTERNAL_EXAMINER",
    "EMPLOYER", "AUDITOR", "REGULATORY_INSPECTOR",
  ]),
  fullName: z.string().min(2),
});

// Only ICT admin / super admin can provision staff and trainer accounts —
// this is the RBAC administration surface the brief asks for.
usersRouter.post(
  "/",
  requireAuth,
  requireRole("ICT_ADMIN", "SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    const parsed = createUserSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid user details." });

    // KSEC-003 — password policy + configurable bcrypt cost (was: min 8 chars, cost 10).
    const policy = validatePassword(parsed.data.password, { email: parsed.data.email, name: parsed.data.fullName });
    if (!policy.ok) return res.status(400).json({ message: policy.problems.join(" "), code: "WEAK_PASSWORD", issues: policy.problems });
    const passwordHash = await bcrypt.hash(parsed.data.password, bcryptRounds());
    const user = await prisma.user.create({
      data: {
        email: parsed.data.email,
        passwordHash,
        role: parsed.data.role,
      },
    });

    let staffNumber: string | undefined;
    if (parsed.data.role === "TRAINER") {
      const sequence = await prisma.idSequence.upsert({
        where: { name: "staff" },
        create: { name: "staff", value: 1 },
        update: { value: { increment: 1 } },
      });
      staffNumber = `STF-${new Date().getFullYear()}-${String(sequence.value).padStart(6, "0")}`;
      await prisma.trainer.create({
        data: { userId: user.id, fullName: parsed.data.fullName, staffNumber, qualifications: [] },
      });
    } else if (!["STUDENT", "APPLICANT", "EMPLOYER"].includes(parsed.data.role)) {
      const sequence = await prisma.idSequence.upsert({
        where: { name: "staff" },
        create: { name: "staff", value: 1 },
        update: { value: { increment: 1 } },
      });
      staffNumber = `STF-${new Date().getFullYear()}-${String(sequence.value).padStart(6, "0")}`;
      await prisma.staffProfile.create({
        data: { userId: user.id, fullName: parsed.data.fullName, staffNumber },
      });
    }

    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        action: "USER_CREATED",
        entityType: "User",
        entityId: user.id,
        metadata: { role: parsed.data.role },
      },
    });

    res.status(201).json({ id: user.id, email: user.email, role: user.role, staffNumber, emailStatus: staffNumber ? "not_configured" : undefined });
  }
);

const statusSchema = z.object({ isActive: z.boolean() });

usersRouter.patch(
  "/:id/status",
  requireAuth,
  requireRole("ICT_ADMIN", "SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    const parsed = statusSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid status." });

    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: { isActive: parsed.data.isActive },
    });

    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        action: parsed.data.isActive ? "USER_REACTIVATED" : "USER_DEACTIVATED",
        entityType: "User",
        entityId: user.id,
      },
    });

    res.json({ id: user.id, isActive: user.isActive });
  }
);
