import { idempotent } from "../lib/idempotency.js";
import { Router } from "express";
import { z } from "zod";
import { customAlphabet } from "nanoid";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import type { Readable } from "node:stream";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireRole, AuthedRequest } from "../middleware/auth.js";
import { validatePassword, bcryptRounds } from "../lib/password-policy.js";
import { admissionMagicMatches, classifyAdmissionUpload, maxAdmissionUploadBytes } from "../lib/admission-files.js";
import { removeFromDisk, resolveStoragePath, streamToDisk, UploadTooLargeError } from "../lib/media-storage.js";
import { admitApplication } from "../lib/admission.js";

export const applicationsRouter = Router();

const refAlphabet = customAlphabet("ABCDEFGHJKLMNPQRSTUVWXYZ23456789", 8);

const applySchema = z.object({
  fullName: z.string().min(2),
  email: z.string().email().transform((value) => value.trim().toLowerCase()),
  phone: z.string().min(7),
  programmeSlug: z.string(),
  studyMode: z.string(),
  kcseIndex: z.string().optional(),
  kcseGrade: z.string().optional(),
  password: z.string().min(1).max(200),
});

// Public: submit an application.
applicationsRouter.post("/", idempotent(), async (req, res) => {
  const parsed = applySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Please check your application details." });
  }
  const { programmeSlug, password, ...rest } = parsed.data;
  const passwordCheck = validatePassword(password, { email: rest.email, name: rest.fullName });
  if (!passwordCheck.ok) {
    return res.status(400).json({ message: passwordCheck.problems.join(" "), code: "WEAK_PASSWORD", issues: passwordCheck.problems });
  }

  const programme = await prisma.programme.findUnique({ where: { slug: programmeSlug } });
  if (!programme) {
    return res.status(400).json({ message: "That programme is not currently open for applications." });
  }

  const refNumber = `MBC-${new Date().getFullYear()}-${refAlphabet()}`;

  const application = await prisma.application.create({
    data: {
      refNumber,
      fullName: rest.fullName,
      email: rest.email,
      temporaryPasswordHash: await bcrypt.hash(password, bcryptRounds()),
      phone: rest.phone,
      studyMode: rest.studyMode,
      kcseIndex: rest.kcseIndex,
      kcseGrade: rest.kcseGrade,
      programmeId: programme.id,
    },
  });

  res.status(201).json({ refNumber: application.refNumber });
});

// Staff: list & review applications. RG002 — now includes each
// application's submitted documents (with verification status) so a
// reviewer isn't deciding blind on documents they can't even see here.
applicationsRouter.get(
  "/",
  requireAuth,
  requireRole("ADMISSIONS_OFFICER", "REGISTRAR", "SUPER_ADMIN"),
  async (_req: AuthedRequest, res) => {
    const applications = await prisma.application.findMany({
      select: {
        id: true,
        refNumber: true,
        fullName: true,
        email: true,
        phone: true,
        status: true,
        decisionNote: true,
        createdAt: true,
        programme: { select: { name: true } },
        documents: {
          select: { id: true, category: true, fileUrl: true, verified: true, verifiedAt: true, uploadedAt: true },
          orderBy: { uploadedAt: "asc" },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    res.json(applications);
  }
);

// RG002 — public document submission for an applicant who has no user
// account yet (accounts are only created on admission). The applicant has
// no login to authenticate with, so the ref number plus the exact email
// they applied with is the lightweight identity check — the same two
// facts admissions staff would ask for over the phone. Applicants may
// submit external links or use the validated local-file upload endpoint.
const applicantDocSchema = z.object({
  email: z.string().email(),
  category: z.enum(["id_document", "certificate", "portrait_photo"]),
  fileUrl: z.string().url().refine((value) => ["http:", "https:"].includes(new URL(value).protocol)),
});

applicationsRouter.post("/:refNumber/documents", async (req, res) => {
  const parsed = applicantDocSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Provide a valid email, document category, and file URL." });
  }
  const application = await prisma.application.findUnique({ where: { refNumber: req.params.refNumber } });
  if (!application || application.email.toLowerCase() !== parsed.data.email.toLowerCase()) {
    return res.status(404).json({ message: "No application found with that reference number and email." });
  }

  const document = await prisma.document.create({
    data: {
      applicationId: application.id,
      category: parsed.data.category,
      fileUrl: parsed.data.fileUrl,
    },
  });
  res.status(201).json({
    id: document.id,
    category: document.category,
    fileUrl: document.fileUrl,
    verified: document.verified,
    uploadedAt: document.uploadedAt,
  });
});

// Applicants may upload directly from a device. The raw stream is checked
// against an allow-list, size ceiling and file signature before it is kept.
applicationsRouter.post("/:refNumber/files", async (req, res) => {
    const email = z.string().email().safeParse(req.query.email);
    const category = z.enum(["id_document", "certificate", "portrait_photo"]).safeParse(req.query.category);
    if (!email.success || !category.success) {
      return res.status(400).json({ message: "Provide the application email and a valid document category." });
    }
    const application = await prisma.application.findUnique({ where: { refNumber: req.params.refNumber } });
    if (!application || application.email.toLowerCase() !== email.data.toLowerCase()) {
      return res.status(404).json({ message: "No application found with that reference number and email." });
    }

    const mime = String(req.headers["content-type"] ?? "").split(";")[0].trim().toLowerCase();
    const cls = classifyAdmissionUpload(mime, category.data);
    if (!cls.ok) return res.status(415).json({ message: cls.message });
    const declared = Number(req.headers["content-length"] ?? 0);
    const limit = maxAdmissionUploadBytes(category.data);
    if (declared > limit) return res.status(413).json({ message: "The file exceeds the allowed upload size." });

    let name = "admission-document";
    try {
      name = decodeURIComponent(String(req.headers["x-file-name"] ?? name)).replace(/[\\/]/g, "_").slice(0, 120);
    } catch {
      return res.status(400).json({ message: "X-File-Name must be URI-encoded." });
    }
    const storageKey = `${randomBytes(16).toString("hex")}${cls.ext}`;
    try {
      const stored = await streamToDisk(req as unknown as Readable, storageKey, limit);
      if (!stored.bytes || !admissionMagicMatches(cls.mime, name, stored.head)) {
        await removeFromDisk(storageKey);
        return res.status(415).json({ message: "The file is empty or its contents don't match the declared type." });
      }
      const uploaded = await prisma.$transaction(async (tx) => {
        const document = await tx.document.create({
          data: {
            applicationId: application.id,
            category: category.data,
            fileUrl: "",
            storageKey,
            mimeType: cls.mime,
            originalName: name,
          },
        });
        const fileUrl = `/api/applications/files/${document.id}`;
        const updated = await tx.document.update({ where: { id: document.id }, data: { fileUrl } });
        if (category.data === "portrait_photo") {
          await tx.application.update({ where: { id: application.id }, data: { portraitPhotoUrl: fileUrl } });
        }
        return { id: updated.id, category: updated.category, fileUrl };
      });
      return res.status(201).json({ ...uploaded, verified: false });
    } catch (err) {
      await removeFromDisk(storageKey);
      if (err instanceof UploadTooLargeError) return res.status(413).json({ message: "The file exceeds the allowed upload size." });
      return res.status(500).json({ message: "The upload failed. Please try again." });
    }
});

applicationsRouter.get("/files/:documentId", requireAuth, async (req: AuthedRequest, res) => {
    const document = await prisma.document.findUnique({ where: { id: req.params.documentId } });
    if (!document?.storageKey || !document.mimeType || !document.applicationId) {
      return res.status(404).json({ message: "File not found." });
    }
    const allowedRole = ["ADMISSIONS_OFFICER", "REGISTRAR", "SUPER_ADMIN"].includes(req.user!.role);
    const student = await prisma.student.findUnique({ where: { userId: req.user!.id }, select: { applicationId: true } });
    if (!allowedRole && student?.applicationId !== document.applicationId) {
      return res.status(403).json({ message: "You don't have access to this file." });
    }
    const abs = resolveStoragePath(document.storageKey);
    if (!abs) return res.status(404).json({ message: "File not found." });
    res.setHeader("Content-Type", document.mimeType);
    res.setHeader("Content-Disposition", `inline; filename="${(document.originalName ?? "document").replace(/["\\\r\n]/g, "_")}"`);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.sendFile(abs, (err) => {
      if (err && !res.headersSent) res.status(404).json({ message: "File not found." });
    });
});

// RG002 — admissions staff actually verifying a submitted document
// against the application, rather than the decision route silently
// trusting whatever the applicant uploaded.
applicationsRouter.patch(
  "/:id/documents/:docId/verify",
  requireAuth,
  requireRole("ADMISSIONS_OFFICER", "REGISTRAR", "SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    const document = await prisma.document.findUnique({ where: { id: req.params.docId } });
    if (!document || document.applicationId !== req.params.id) {
      return res.status(404).json({ message: "Document not found on this application." });
    }
    const verified = req.body?.verified !== false;

    const updated = await prisma.document.update({
      where: { id: document.id },
      data: verified
        ? { verified: true, verifiedById: req.user!.id, verifiedAt: new Date() }
        : { verified: false, verifiedById: null, verifiedAt: null },
    });

    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        action: verified ? "APPLICATION_DOCUMENT_VERIFIED" : "APPLICATION_DOCUMENT_UNVERIFIED",
        entityType: "Document",
        entityId: updated.id,
        metadata: { applicationId: req.params.id },
      },
    });

    let admittedStudentNumber: string | undefined;
    if (verified) {
      try {
        const application = await prisma.application.findUnique({ where: { id: req.params.id }, select: { status: true } });
        const complete = await prisma.document.findMany({
          where: { applicationId: req.params.id },
          select: { category: true, verified: true },
        });
        if (
          ["SUBMITTED", "UNDER_REVIEW"].includes(application?.status ?? "") &&
          complete.every((document) => document.verified) &&
          ["id_document", "certificate", "portrait_photo"].every((required) => complete.some((d) => d.category === required))
        ) {
          const result = await prisma.$transaction((tx) => admitApplication(tx, req.params.id, req.user!.id));
          admittedStudentNumber = result.student.studentNumber;
        }
      } catch (error) {
        if (error instanceof Error && ["EMAIL_ALREADY_IN_USE", "PHONE_ALREADY_IN_USE"].includes(error.message)) {
          return res.status(409).json({ message: "The applicant email or phone already belongs to an account. Resolve the duplicate account before admission." });
        }
        if (error instanceof Error && error.message.startsWith("ADMISSION_DOCUMENTS_")) {
          return res.json(updated);
        }
        if (error instanceof Error && error.message === "TEMPORARY_PASSWORD_REQUIRED") {
          return res.status(409).json({ message: "This legacy application has no temporary password. Ask the applicant to submit a new application." });
        }
        throw error;
      }
    }
    res.json({ ...updated, admittedStudentNumber });
  }
);

const decisionSchema = z.object({
  status: z.enum(["ADMITTED", "REJECTED", "WAITLISTED"]),
  decisionNote: z.string().optional(),
});

applicationsRouter.patch(
  "/:id/decision",
  requireAuth,
  requireRole("ADMISSIONS_OFFICER", "REGISTRAR", "SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    const parsed = decisionSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Provide a valid decision." });
    }

    if (parsed.data.status === "ADMITTED") {
      const documents = await prisma.document.findMany({ where: { applicationId: req.params.id } });
      const unverified = documents.filter((d) => !d.verified);
      const missing = ["id_document", "certificate", "portrait_photo"].filter(
        (category) => !documents.some((document) => document.category === category && document.verified)
      );
      if (unverified.length > 0 || missing.length > 0) {
        return res.status(400).json({
          message: `Cannot admit until all required documents are submitted and verified${missing.length ? ` (missing: ${missing.join(", ")})` : ""}.`,
          unverifiedCategories: unverified.map((d) => d.category),
        });
      }
    }

    let application;
    try {
      application = parsed.data.status === "ADMITTED"
        ? await prisma.$transaction(async (tx) => {
            const result = await admitApplication(tx, req.params.id, req.user!.id);
            return tx.application.update({
              where: { id: req.params.id },
              data: { status: parsed.data.status, decisionNote: parsed.data.decisionNote, reviewedById: req.user!.id },
            }).then((updated) => ({ ...updated, studentNumber: result.student.studentNumber }));
          })
        : await prisma.application.update({
          where: { id: req.params.id },
          data: { status: parsed.data.status, decisionNote: parsed.data.decisionNote, reviewedById: req.user!.id },
        });
    } catch (error) {
      if (error instanceof Error && ["EMAIL_ALREADY_IN_USE", "PHONE_ALREADY_IN_USE"].includes(error.message)) {
        return res.status(409).json({ message: "The applicant email or phone already belongs to an account. Resolve the duplicate account before admission." });
      }
      if (error instanceof Error && error.message.startsWith("ADMISSION_DOCUMENTS_")) {
        return res.status(400).json({ message: "Admission requires all required documents to be verified." });
      }
      if (error instanceof Error && error.message === "TEMPORARY_PASSWORD_REQUIRED") {
        return res.status(409).json({ message: "This legacy application has no temporary password. Ask the applicant to submit a new application." });
      }
      throw error;
    }

    if (parsed.data.status !== "ADMITTED") await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        action: `APPLICATION_${parsed.data.status}`,
        entityType: "Application",
        entityId: application.id,
      },
    });

    const { temporaryPasswordHash, ...safeApplication } = application;
    void temporaryPasswordHash;
    res.json(safeApplication);
  }
);
