import { Router } from "express";
import { stringify } from "csv-stringify/sync";
import { parse } from "csv-parse/sync";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireRole, AuthedRequest } from "../middleware/auth.js";

export const kuccpsRouter = Router();

// KUCCPS has no public API for placement data exchange. In practice,
// institutions exchange structured files (typically CSV/Excel) through
// KUCCPS's own portal or designated channels. This module generates the
// export in a KUCCPS-compatible column layout and lets staff import a
// placement result file back in — it does not claim to talk to KUCCPS
// directly.

// Export: admitted students ready to report to KUCCPS as institution intake.
kuccpsRouter.get(
  "/export/intake",
  requireAuth,
  requireRole("REGISTRAR", "ADMISSIONS_OFFICER", "SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    const admitted = await prisma.application.findMany({
      where: { status: "ADMITTED" },
      include: { programme: true },
    });

    // Batch 66 — use the programme's real KUCCPS code (Programme.kuccpsCode, set via PATCH
    // /programme-codes/:id below). A programme KUCCPS has not assigned a code to yet still exports
    // under its internal slug, and the response says how many rows fell back so the registrar knows
    // the file is not ready to submit as-is.
    const missingCodes = admitted.filter((a) => !a.programme.kuccpsCode).length;
    const rows = admitted.map((a) => ({
      institution_code: process.env.INSTITUTION_KUCCPS_CODE ?? "TBD-CONFIRM-WITH-KUCCPS",
      programme_code: a.programme.kuccpsCode ?? a.programme.slug,
      applicant_name: a.fullName,
      kcse_index: a.kcseIndex ?? "",
      email: a.email,
      phone: a.phone,
      status: "ADMITTED",
    }));

    const csv = stringify(rows, { header: true });

    await prisma.kuccpsExportBatch.create({
      data: {
        generatedById: req.user!.id,
        recordCount: rows.length,
        fileUrl: "generated-on-demand", // real deployment would persist to object storage
      },
    });

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=kuccps-intake-export.csv");
    res.setHeader("X-Kuccps-Rows-Missing-Programme-Code", String(missingCodes));
    res.setHeader("Access-Control-Expose-Headers", "X-Kuccps-Rows-Missing-Programme-Code, Content-Disposition");
    res.send(csv);
  }
);

const importRowSchema = z.object({
  kcse_index: z.string(),
  placement_status: z.string(),
  programme_code: z.string().optional(),
});

// Import: a placement result file KUCCPS or the ministry has issued.
// Matches rows to existing applications by KCSE index number and logs the
// batch — it never auto-admits or auto-registers a student.
kuccpsRouter.post(
  "/import/placement-results",
  requireAuth,
  requireRole("REGISTRAR", "SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    const csvText = req.body?.csv;
    if (typeof csvText !== "string") {
      return res.status(400).json({ message: "Send { csv: '<raw csv text>' }." });
    }

    let records: unknown[];
    try {
      records = parse(csvText, { columns: true, skip_empty_lines: true });
    } catch {
      return res.status(400).json({ message: "Could not parse that CSV." });
    }

    let matched = 0;
    const results: { kcseIndex: string; matched: boolean }[] = [];

    for (const raw of records) {
      const parsed = importRowSchema.safeParse(raw);
      if (!parsed.success) continue;
      const application = await prisma.application.findFirst({
        where: { kcseIndex: parsed.data.kcse_index },
      });
      if (application) matched++;
      results.push({ kcseIndex: parsed.data.kcse_index, matched: Boolean(application) });
    }

    const batch = await prisma.kuccpsImportBatch.create({
      data: {
        importedById: req.user!.id,
        sourceFileUrl: "uploaded-inline",
        recordCount: records.length,
        matchedCount: matched,
      },
    });

    res.status(201).json({ batch, results });
  }
);

kuccpsRouter.get(
  "/batches",
  requireAuth,
  requireRole("REGISTRAR", "SUPER_ADMIN"),
  async (_req: AuthedRequest, res) => {
    const [exports, imports] = await Promise.all([
      prisma.kuccpsExportBatch.findMany({ orderBy: { createdAt: "desc" }, take: 20 }),
      prisma.kuccpsImportBatch.findMany({ orderBy: { createdAt: "desc" }, take: 20 }),
    ]);
    res.json({ exports, imports });
  }
);

// Batch 66 — KUCCPS programme codes. Until KUCCPS assigns a code the field is simply null and the
// intake export falls back to the internal slug (and flags it — see above).
kuccpsRouter.get(
  "/programme-codes",
  requireAuth,
  requireRole("REGISTRAR", "ADMISSIONS_OFFICER", "SUPER_ADMIN"),
  async (_req: AuthedRequest, res) => {
    res.json(await prisma.programme.findMany({ select: { id: true, name: true, slug: true, kuccpsCode: true }, orderBy: { name: "asc" } }));
  }
);

const programmeCodeSchema = z.object({ kuccpsCode: z.string().trim().min(1).max(40).nullable() });

kuccpsRouter.patch(
  "/programme-codes/:programmeId",
  requireAuth,
  requireRole("REGISTRAR", "SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    const parsed = programmeCodeSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Send { kuccpsCode: '<code>' } or { kuccpsCode: null } to clear it." });
    const programme = await prisma.programme.findUnique({ where: { id: req.params.programmeId } });
    if (!programme) return res.status(404).json({ message: "Programme not found." });
    const updated = await prisma.programme.update({ where: { id: programme.id }, data: { kuccpsCode: parsed.data.kuccpsCode }, select: { id: true, name: true, slug: true, kuccpsCode: true } });
    await prisma.auditLog.create({ data: { userId: req.user!.id, action: "KUCCPS_PROGRAMME_CODE_SET", entityType: "Programme", entityId: programme.id, metadata: { from: programme.kuccpsCode, to: parsed.data.kuccpsCode } } });
    res.json(updated);
  }
);
