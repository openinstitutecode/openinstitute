import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireRole, AuthedRequest } from "../middleware/auth.js";

export const competencyRouter = Router();

// A student's own passport — evidence-backed record, not just a transcript
// grade. Verification (trainer/industry) is a separate, explicit step, never
// inferred from a score alone.
competencyRouter.get("/passport/mine", requireAuth, async (req: AuthedRequest, res) => {
  const student = await prisma.student.findUnique({ where: { userId: req.user!.id } });
  if (!student) return res.status(404).json({ message: "No student record for this account." });

  const records = await prisma.competencyRecord.findMany({
    where: { studentId: student.id },
    include: { competency: true },
    orderBy: { createdAt: "desc" },
  });
  res.json(records);
});

const recordSchema = z.object({
  studentId: z.string(),
  competencyId: z.string(),
  level: z.enum(["developing", "competent", "advanced"]),
  evidenceSummary: z.string().optional(),
  assessmentScore: z.number().min(0).max(100).optional(),
});

// Only a trainer or examiner can write a competency record, and only a
// trainer's own sign-off counts as trainerVerifiedById — never auto-set from
// an AI tutor interaction.
competencyRouter.post(
  "/records",
  requireAuth,
  requireRole("TRAINER", "EXAMINATION_OFFICER", "SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    const parsed = recordSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid competency record." });

    const record = await prisma.competencyRecord.create({
      data: {
        ...parsed.data,
        trainerVerifiedById: req.user!.id,
        achievedAt: parsed.data.level !== "developing" ? new Date() : undefined,
      },
    });
    res.status(201).json(record);
  }
);

const competencySchema = z.object({
  programmeId: z.string(),
  name: z.string().min(2),
  description: z.string().optional(),
});

competencyRouter.post(
  "/",
  requireAuth,
  requireRole("PROGRAMME_COORDINATOR", "DEPARTMENT_HEAD", "SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    const parsed = competencySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid competency." });
    const competency = await prisma.competency.create({ data: parsed.data });
    res.status(201).json(competency);
  }
);

// ---------------------------------------------------------------------------
// TP009 — Competency mapping: the actual curriculum-to-competency map.
// Previously Competency only linked to Programme; there was no record of
// *which units* build towards a competency, so the only "mapping UI" that
// existed was the student's read-only passport. Trainers know their own
// unit's content best, so mapping is open to TRAINER as well as the
// coordinator-level roles that can create/edit the competencies themselves.
// ---------------------------------------------------------------------------

competencyRouter.get("/programme/:programmeId", requireAuth, async (req, res) => {
  const competencies = await prisma.competency.findMany({
    where: { programmeId: req.params.programmeId },
    include: { unitCompetencies: { include: { unit: { select: { id: true, title: true, code: true } } } } },
    orderBy: { name: "asc" },
  });
  res.json(
    competencies.map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description,
      units: c.unitCompetencies.map((uc) => uc.unit),
    }))
  );
});

// The full unit × competency matrix for a programme — everything the
// mapping UI needs in one call: every unit, every competency, and which
// cells are already checked.
competencyRouter.get("/programme/:programmeId/matrix", requireAuth, async (req, res) => {
  const [units, competencies, mappings] = await Promise.all([
    prisma.unit.findMany({ where: { programmeId: req.params.programmeId }, select: { id: true, code: true, title: true }, orderBy: { code: "asc" } }),
    prisma.competency.findMany({ where: { programmeId: req.params.programmeId }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.unitCompetency.findMany({
      where: { competency: { programmeId: req.params.programmeId } },
      select: { unitId: true, competencyId: true },
    }),
  ]);
  res.json({
    units,
    competencies,
    mapped: mappings.map((m) => `${m.unitId}:${m.competencyId}`),
  });
});

const mapUnitsSchema = z.object({ unitIds: z.array(z.string()) });

// Replaces the full set of units mapped to this competency with the given
// list — simplest correct semantics for a checkbox-grid UI (each save sends
// the row's current checked state, not a diff).
competencyRouter.put(
  "/:id/map-units",
  requireAuth,
  requireRole("TRAINER", "PROGRAMME_COORDINATOR", "DEPARTMENT_HEAD", "SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    const parsed = mapUnitsSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Provide a list of unit IDs." });

    const competency = await prisma.competency.findUnique({ where: { id: req.params.id } });
    if (!competency) return res.status(404).json({ message: "Competency not found." });

    await prisma.$transaction([
      prisma.unitCompetency.deleteMany({ where: { competencyId: competency.id } }),
      ...(parsed.data.unitIds.length > 0
        ? [
            prisma.unitCompetency.createMany({
              data: parsed.data.unitIds.map((unitId) => ({
                unitId,
                competencyId: competency.id,
                mappedById: req.user!.id,
              })),
              skipDuplicates: true,
            }),
          ]
        : []),
    ]);

    const updated = await prisma.competency.findUnique({
      where: { id: competency.id },
      include: { unitCompetencies: { include: { unit: { select: { id: true, title: true, code: true } } } } },
    });
    res.json({ id: updated!.id, name: updated!.name, units: updated!.unitCompetencies.map((uc) => uc.unit) });
  }
);

// Employer-side industry verification of a competency (e.g. after attachment).
competencyRouter.patch(
  "/records/:id/industry-verify",
  requireAuth,
  requireRole("EMPLOYER"),
  async (req: AuthedRequest, res) => {
    const profile = await prisma.employerProfile.findUnique({ where: { userId: req.user!.id } });
    if (!profile) return res.status(400).json({ message: "No employer profile linked to this account." });

    const record = await prisma.competencyRecord.update({
      where: { id: req.params.id },
      data: { industryVerifiedByEmployerId: profile.employerId },
    });
    res.json(record);
  }
);

// LMS035 — microcredentials: stackable, short credentials tied to a
// competency (optional). Distinct from the full Certificate model, which
// represents a whole qualification.
const microcredentialSchema = z.object({
  name: z.string().min(2),
  description: z.string().optional(),
  competencyId: z.string().optional(),
});

competencyRouter.post(
  "/microcredentials",
  requireAuth,
  requireRole("PROGRAMME_COORDINATOR", "SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    const parsed = microcredentialSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid microcredential." });
    const mc = await prisma.microcredential.create({ data: parsed.data });
    res.status(201).json(mc);
  }
);

competencyRouter.get("/microcredentials", requireAuth, async (_req, res) => {
  const list = await prisma.microcredential.findMany({ orderBy: { name: "asc" } });
  res.json(list);
});

const awardMicroSchema = z.object({ studentId: z.string(), microcredentialId: z.string() });

competencyRouter.post(
  "/microcredentials/award",
  requireAuth,
  requireRole("TRAINER", "PROGRAMME_COORDINATOR", "SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    const parsed = awardMicroSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Choose a student and microcredential." });
    const award = await prisma.studentMicrocredential.upsert({
      where: {
        studentId_microcredentialId: {
          studentId: parsed.data.studentId,
          microcredentialId: parsed.data.microcredentialId,
        },
      },
      update: {},
      create: { ...parsed.data, awardedById: req.user!.id },
    });
    res.status(201).json(award);
  }
);

competencyRouter.get("/microcredentials/mine", requireAuth, async (req: AuthedRequest, res) => {
  const student = await prisma.student.findUnique({ where: { userId: req.user!.id } });
  if (!student) return res.status(404).json({ message: "No student record for this account." });
  const awards = await prisma.studentMicrocredential.findMany({
    where: { studentId: student.id },
    include: { microcredential: true },
    orderBy: { awardedAt: "desc" },
  });
  res.json(awards);
});

// SP022 — competency evidence portfolio: a student-initiated submission,
// kept separate from CompetencyRecord (which only a trainer/examiner can
// write directly). Accepting a submission below creates or upgrades a real
// CompetencyRecord; it never happens automatically from the submission alone.
const evidenceSchema = z.object({
  competencyId: z.string(),
  description: z.string().min(5),
  evidenceUrl: z.string().url().optional(),
});

competencyRouter.post("/evidence", requireAuth, async (req: AuthedRequest, res) => {
  const parsed = evidenceSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Describe the evidence (min 5 characters)." });

  const student = await prisma.student.findUnique({ where: { userId: req.user!.id } });
  if (!student) return res.status(404).json({ message: "No student record for this account." });

  const evidence = await prisma.competencyEvidence.create({
    data: { ...parsed.data, studentId: student.id },
  });
  res.status(201).json(evidence);
});

competencyRouter.get("/evidence/mine", requireAuth, async (req: AuthedRequest, res) => {
  const student = await prisma.student.findUnique({ where: { userId: req.user!.id } });
  if (!student) return res.status(404).json({ message: "No student record for this account." });
  const evidence = await prisma.competencyEvidence.findMany({
    where: { studentId: student.id },
    include: { competency: true },
    orderBy: { submittedAt: "desc" },
  });
  res.json(evidence);
});

competencyRouter.get(
  "/evidence/pending",
  requireAuth,
  requireRole("TRAINER", "EXAMINATION_OFFICER", "SUPER_ADMIN"),
  async (_req: AuthedRequest, res) => {
    const pending = await prisma.competencyEvidence.findMany({
      where: { status: "pending" },
      include: { competency: true, student: { select: { fullName: true, studentNumber: true } } },
      orderBy: { submittedAt: "asc" },
    });
    res.json(pending);
  }
);

const reviewSchema = z.object({
  decision: z.enum(["accepted", "rejected"]),
  reviewNote: z.string().optional(),
  awardLevel: z.enum(["competent", "advanced"]).default("competent"),
});

competencyRouter.patch(
  "/evidence/:id/review",
  requireAuth,
  requireRole("TRAINER", "EXAMINATION_OFFICER", "SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    const parsed = reviewSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Choose accepted or rejected." });

    const evidence = await prisma.competencyEvidence.findUnique({ where: { id: req.params.id } });
    if (!evidence) return res.status(404).json({ message: "Evidence submission not found." });

    const updated = await prisma.competencyEvidence.update({
      where: { id: req.params.id },
      data: {
        status: parsed.data.decision,
        reviewedById: req.user!.id,
        reviewedAt: new Date(),
        reviewNote: parsed.data.reviewNote,
      },
    });

    if (parsed.data.decision === "accepted") {
      const existing = await prisma.competencyRecord.findFirst({
        where: { studentId: evidence.studentId, competencyId: evidence.competencyId },
      });
      if (existing) {
        await prisma.competencyRecord.update({
          where: { id: existing.id },
          data: {
            level: parsed.data.awardLevel,
            evidenceSummary: evidence.description,
            trainerVerifiedById: req.user!.id,
            achievedAt: new Date(),
          },
        });
      } else {
        await prisma.competencyRecord.create({
          data: {
            studentId: evidence.studentId,
            competencyId: evidence.competencyId,
            level: parsed.data.awardLevel,
            evidenceSummary: evidence.description,
            trainerVerifiedById: req.user!.id,
            achievedAt: new Date(),
          },
        });
      }
    }

    res.json(updated);
  }
);
