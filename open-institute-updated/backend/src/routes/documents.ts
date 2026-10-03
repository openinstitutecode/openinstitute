import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireRole, AuthedRequest } from "../middleware/auth.js";

export const documentsRouter = Router();

const docSchema = z.object({
  category: z.enum(["id_document", "certificate", "policy", "moU", "evidence"]),
  fileUrl: z.string().url(),
  applicationId: z.string().optional(),
});

// Records a document reference. Actual file storage (S3-compatible bucket or
// similar) happens client-side/upload-service-side; this just tracks
// metadata, ownership, and version history for audit purposes.
documentsRouter.post("/", requireAuth, async (req: AuthedRequest, res) => {
  const parsed = docSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid document reference." });

  const document = await prisma.document.create({
    data: {
      ownerUserId: req.user!.id,
      category: parsed.data.category,
      fileUrl: parsed.data.fileUrl,
      applicationId: parsed.data.applicationId,
    },
  });
  res.status(201).json(document);
});

documentsRouter.get("/mine", requireAuth, async (req: AuthedRequest, res) => {
  const documents = await prisma.document.findMany({
    where: { ownerUserId: req.user!.id },
    orderBy: { uploadedAt: "desc" },
  });
  res.json(documents);
});

// AD019 — admin-wide document management. GET /mine (above) only ever
// showed a user their own documents; there was no way for ICT/registry
// staff to see the institution's documents as a whole. Real filter by
// category, real applicant/owner email shown, nothing invented.
documentsRouter.get(
  "/",
  requireAuth,
  requireRole("ICT_ADMIN", "REGISTRAR", "SUPER_ADMIN", "QA_OFFICER"),
  async (req: AuthedRequest, res) => {
    const category = typeof req.query.category === "string" ? req.query.category : undefined;
    const documents = await prisma.document.findMany({
      where: category ? { category } : undefined,
      orderBy: { uploadedAt: "desc" },
      take: 200,
      include: { owner: { select: { email: true, role: true } } },
    });
    res.json(documents);
  }
);

// New version of an existing document: same category, ownership retained,
// version incremented — the old fileUrl stays in the audit trail via AuditLog.
documentsRouter.post("/:id/new-version", requireAuth, async (req: AuthedRequest, res) => {
  const parsed = z.object({ fileUrl: z.string().url() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Provide a valid file URL." });

  const existing = await prisma.document.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.ownerUserId !== req.user!.id) {
    return res.status(404).json({ message: "Document not found." });
  }

  const updated = await prisma.document.update({
    where: { id: existing.id },
    data: { fileUrl: parsed.data.fileUrl, version: existing.version + 1 },
  });

  await prisma.auditLog.create({
    data: {
      userId: req.user!.id,
      action: "DOCUMENT_VERSIONED",
      entityType: "Document",
      entityId: updated.id,
      metadata: { previousFileUrl: existing.fileUrl, newVersion: updated.version },
    },
  });

  res.json(updated);
});
