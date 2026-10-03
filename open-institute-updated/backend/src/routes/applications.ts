import { idempotent } from "../lib/idempotency.js";
import { Router } from "express";
import { z } from "zod";
import { customAlphabet } from "nanoid";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireRole, AuthedRequest } from "../middleware/auth.js";

export const applicationsRouter = Router();

const refAlphabet = customAlphabet("ABCDEFGHJKLMNPQRSTUVWXYZ23456789", 8);

const applySchema = z.object({
  fullName: z.string().min(2),
  email: z.string().email(),
  phone: z.string().min(7),
  programmeSlug: z.string(),
  studyMode: z.string(),
  kcseIndex: z.string().optional(),
  kcseGrade: z.string().optional(),
});

// Public: submit an application.
applicationsRouter.post("/", idempotent(), async (req, res) => {
  const parsed = applySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Please check your application details." });
  }
  const { programmeSlug, ...rest } = parsed.data;

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
      include: {
        programme: true,
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
// facts admissions staff would ask for over the phone. Actual file
// storage is out of scope here (same URL-reference pattern as the
// authenticated /documents route); this only tracks the reference.
const applicantDocSchema = z.object({
  email: z.string().email(),
  category: z.enum(["id_document", "certificate"]),
  fileUrl: z.string().url(),
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

    res.json(updated);
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

    // RG002 — a real gate, not just a UI suggestion: an application cannot
    // be admitted while it has submitted documents that haven't actually
    // been verified. An application with zero submitted documents is not
    // blocked here — that's a missing-documents problem for the reviewer
    // to judge, not a verification problem this gate is meant to catch.
    if (parsed.data.status === "ADMITTED") {
      const documents = await prisma.document.findMany({ where: { applicationId: req.params.id } });
      const unverified = documents.filter((d) => !d.verified);
      if (unverified.length > 0) {
        return res.status(400).json({
          message: `Cannot admit: ${unverified.length} submitted document(s) are not yet verified.`,
          unverifiedCategories: unverified.map((d) => d.category),
        });
      }
    }

    const application = await prisma.application.update({
      where: { id: req.params.id },
      data: {
        status: parsed.data.status,
        decisionNote: parsed.data.decisionNote,
        reviewedById: req.user!.id,
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        action: `APPLICATION_${parsed.data.status}`,
        entityType: "Application",
        entityId: application.id,
      },
    });

    res.json(application);
  }
);
