import { Router } from "express";
import { stringify } from "csv-stringify/sync";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireRole, AuthedRequest } from "../middleware/auth.js";

export const regulatoryReportsRouter = Router();

// ---------------------------------------------------------------------------
// RG036 — Government reporting beyond KUCCPS. routes/kuccps.ts already
// covers the KUCCPS placement exchange (its own file-exchange shape, with
// its own KuccpsExportBatch/KuccpsImportBatch log). This file is for the
// other real, recurring regulatory data returns a Kenyan TVET institution
// has to produce — built only from data this schema actually holds. No
// report here invents a field the app doesn't collect: there's no NITA
// training-levy return, for example, because nothing in this system tracks
// levy contributions. See docs/regulatory-notes.md for which regulators
// apply and what's still pending written confirmation from each of them —
// these reports are the data layer; the notes file is the compliance
// research layer, and the two are deliberately not conflated.
// ---------------------------------------------------------------------------

async function logReport(regulator: string, reportType: string, recordCount: number, userId: string) {
  await prisma.regulatoryReportBatch.create({
    data: { regulator, reportType, recordCount, generatedById: userId },
  });
}

// TVETA trainer credentials return: licence numbers, expiry, and a
// server-computed status flag for any trainer whose TVETA licence is
// missing or has expired — exactly what a real inspection asks for first,
// not left for a human to eyeball down a spreadsheet column.
regulatoryReportsRouter.get(
  "/tveta/trainer-credentials",
  requireAuth,
  requireRole("REGISTRAR", "QA_OFFICER", "PRINCIPAL", "SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    const trainers = await prisma.trainer.findMany({ include: { user: true } });
    const now = new Date();

    const rows = trainers.map((t) => ({
      trainer_email: t.user.email,
      department: t.department ?? "",
      tveta_licence_number: t.tvetaLicenceNumber ?? "",
      licence_expiry: t.licenceExpiry ? t.licenceExpiry.toISOString().slice(0, 10) : "",
      licence_status: !t.tvetaLicenceNumber ? "MISSING" : t.licenceExpiry && t.licenceExpiry < now ? "EXPIRED" : "VALID",
      qualifications: t.qualifications.join("; "),
    }));

    await logReport("TVETA", "trainer_credentials", rows.length, req.user!.id);

    const csv = stringify(rows, { header: true });
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=tveta-trainer-credentials.csv");
    res.send(csv);
  }
);

// TVETA / KNQA programme & enrolment return: one row per accredited
// programme with its qualification level, awarding body, and current
// headcount. Same underlying counts as RG035's /registry/statistics, but
// laid out as the flat, per-programme file a regulator actually expects to
// receive — not an internal analytics JSON shape repurposed as a report.
regulatoryReportsRouter.get(
  "/tveta/programme-enrolment",
  requireAuth,
  requireRole("REGISTRAR", "QA_OFFICER", "PRINCIPAL", "SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    const programmes = await prisma.programme.findMany({ include: { students: true, awardingBody: true } });

    const rows = programmes.map((p) => ({
      programme_name: p.name,
      qualification_level: p.qualificationLevel,
      approval_status: p.approvalStatus,
      awarding_body: p.awardingBody?.name ?? "",
      delivery_mode: p.deliveryMode,
      currently_enrolled: p.students.filter((s) => s.academicStatus === "ACTIVE").length,
      total_ever_enrolled: p.students.length,
    }));

    await logReport("TVETA", "programme_enrolment", rows.length, req.user!.id);

    const csv = stringify(rows, { header: true });
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=tveta-programme-enrolment.csv");
    res.send(csv);
  }
);

regulatoryReportsRouter.get(
  "/batches",
  requireAuth,
  requireRole("REGISTRAR", "QA_OFFICER", "PRINCIPAL", "SUPER_ADMIN"),
  async (_req: AuthedRequest, res) => {
    const batches = await prisma.regulatoryReportBatch.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { generatedBy: { select: { email: true } } },
    });
    res.json(batches);
  }
);

// KNQA qualification-outcomes return: one row per accredited programme with
// the qualification level it awards and how many students have actually
// completed/graduated against it — the KNQA-specific question (does the
// national framework level match real completions?) rather than the
// TVETA-shaped enrolment-headcount report above.
regulatoryReportsRouter.get(
  "/knqa/qualification-outcomes",
  requireAuth,
  requireRole("REGISTRAR", "QA_OFFICER", "PRINCIPAL", "SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    const programmes = await prisma.programme.findMany({
      include: { students: true, awardingBody: true },
    });

    const rows = programmes.map((p) => ({
      programme_name: p.name,
      qualification_level: p.qualificationLevel,
      approval_status: p.approvalStatus,
      awarding_body: p.awardingBody?.name ?? "",
      graduated_count: p.students.filter((s) => s.academicStatus === "GRADUATED").length,
      active_count: p.students.filter((s) => s.academicStatus === "ACTIVE").length,
    }));

    await logReport("KNQA", "qualification_outcomes", rows.length, req.user!.id);

    const csv = stringify(rows, { header: true });
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=knqa-qualification-outcomes.csv");
    res.send(csv);
  }
);
