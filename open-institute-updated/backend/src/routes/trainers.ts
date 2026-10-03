import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireRole, AuthedRequest } from "../middleware/auth.js";

export const trainersRouter = Router();

trainersRouter.get(
  "/",
  requireAuth,
  requireRole("HR_OFFICER", "PRINCIPAL", "QA_OFFICER", "SUPER_ADMIN"),
  async (_req: AuthedRequest, res) => {
    const trainers = await prisma.trainer.findMany({
      include: { user: { select: { email: true, isActive: true } }, courses: true },
      orderBy: { fullName: "asc" },
    });

    const now = new Date();
    const rows = trainers.map((t) => {
      let status: "valid" | "expiring" | "expired" | "unknown" = "unknown";
      if (t.licenceExpiry) {
        const daysLeft = (t.licenceExpiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
        status = daysLeft < 0 ? "expired" : daysLeft < 30 ? "expiring" : "valid";
      }
      return {
        id: t.id,
        fullName: t.fullName,
        department: t.department,
        email: t.user.email,
        tvetaLicenceNumber: t.tvetaLicenceNumber,
        licenceExpiry: t.licenceExpiry,
        licenceStatus: status,
        // TP039 — a real verification record, distinct from just having a
        // licence number on file (anyone can type a number; verification
        // means HR/Principal actually confirmed it against TVETA).
        licenceVerified: t.licenceVerified,
        licenceVerifiedAt: t.licenceVerifiedAt,
        licenceDocumentUrl: t.licenceDocumentUrl,
        courseCount: t.courses.length,
      };
    });

    res.json(rows);
  }
);

// ---------------------------------------------------------------------------
// AD008 — full trainer-profile CRUD. Deliberately does NOT duplicate
// activate/deactivate here: User.isActive is already the single source of
// truth for account status, and PATCH /users/:id/status in users.ts already
// audits that change (USER_DEACTIVATED/USER_REACTIVATED) for every role,
// trainers included. Re-implementing that here would create a second path
// that could drift out of sync with the real audited one. This CRUD is for
// the trainer-specific profile fields (licence, department, qualifications)
// that users.ts has no reason to know about.
// ---------------------------------------------------------------------------

const trainerCreateSchema = z.object({
  userId: z.string(),
  fullName: z.string().min(2),
  department: z.string().optional(),
  tvetaLicenceNumber: z.string().optional(),
  licenceExpiry: z.string().datetime().optional(),
  qualifications: z.array(z.string()).default([]),
  licenceDocumentUrl: z.string().url().optional(),
});

trainersRouter.post(
  "/",
  requireAuth,
  requireRole("HR_OFFICER", "PRINCIPAL", "SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    const parsed = trainerCreateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Provide userId and fullName at minimum." });

    const user = await prisma.user.findUnique({ where: { id: parsed.data.userId } });
    if (!user) return res.status(404).json({ message: "No user with that id." });
    if (user.role !== "TRAINER") {
      return res.status(400).json({ message: "That user's role is not TRAINER — create the account with the TRAINER role first (Users & RBAC)." });
    }

    const trainer = await prisma.trainer
      .create({
        data: {
          ...parsed.data,
          licenceExpiry: parsed.data.licenceExpiry ? new Date(parsed.data.licenceExpiry) : undefined,
        },
      })
      .catch(() => null);
    if (!trainer) return res.status(409).json({ message: "A trainer profile already exists for that user." });
    res.status(201).json(trainer);
  }
);

const trainerUpdateSchema = trainerCreateSchema.omit({ userId: true }).partial();

trainersRouter.patch(
  "/:id",
  requireAuth,
  requireRole("HR_OFFICER", "PRINCIPAL", "SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    const parsed = trainerUpdateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid update." });
    const { licenceExpiry, ...rest } = parsed.data;

    // TP039 — changing the licence number or expiry invalidates any prior
    // verification (it was verification of the OLD data); same discipline
    // as LMS037 resetting a lesson to pending_review on a substantive
    // content edit, so "verified" can never silently keep describing data
    // that's since changed.
    const existing = await prisma.trainer.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ message: "No trainer profile with that id." });
    const licenceDataChanged =
      (rest.tvetaLicenceNumber !== undefined && rest.tvetaLicenceNumber !== existing.tvetaLicenceNumber) ||
      (licenceExpiry !== undefined && new Date(licenceExpiry).getTime() !== existing.licenceExpiry?.getTime());

    const updated = await prisma.trainer
      .update({
        where: { id: req.params.id },
        data: {
          ...rest,
          licenceExpiry: licenceExpiry ? new Date(licenceExpiry) : undefined,
          ...(licenceDataChanged ? { licenceVerified: false, licenceVerifiedAt: null, licenceVerifiedById: null } : {}),
        },
      })
      .catch(() => null);
    if (!updated) return res.status(404).json({ message: "No trainer profile with that id." });
    res.json(updated);
  }
);

// TP039 — the actual verification action: HR/Principal confirming the
// licence on file is real (checked against TVETA, or against the
// attached licenceDocumentUrl) — a distinct, audited event from just
// having typed a number into the create/edit form.
trainersRouter.patch(
  "/:id/verify-licence",
  requireAuth,
  requireRole("HR_OFFICER", "PRINCIPAL", "SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    const trainer = await prisma.trainer.findUnique({ where: { id: req.params.id } });
    if (!trainer) return res.status(404).json({ message: "No trainer profile with that id." });
    if (!trainer.tvetaLicenceNumber) {
      return res.status(400).json({ message: "This trainer has no TVETA licence number on file to verify." });
    }

    const updated = await prisma.$transaction(async (tx) => {
      const t = await tx.trainer.update({
        where: { id: req.params.id },
        data: { licenceVerified: true, licenceVerifiedAt: new Date(), licenceVerifiedById: req.user!.id },
      });
      await tx.auditLog.create({
        data: {
          userId: req.user!.id,
          action: "TRAINER_LICENCE_VERIFIED",
          entityType: "Trainer",
          entityId: t.id,
          metadata: { tvetaLicenceNumber: t.tvetaLicenceNumber, licenceExpiry: t.licenceExpiry },
        },
      });
      return t;
    });
    res.json(updated);
  }
);

// Users with role TRAINER that have no Trainer profile yet — the create
// form's picker source, so HR isn't typing a userId blind.
trainersRouter.get(
  "/unlinked-users",
  requireAuth,
  requireRole("HR_OFFICER", "PRINCIPAL", "SUPER_ADMIN"),
  async (_req: AuthedRequest, res) => {
    const users = await prisma.user.findMany({
      where: { role: "TRAINER", trainer: null },
      select: { id: true, email: true, isActive: true },
      orderBy: { email: "asc" },
    });
    res.json(users);
  }
);
