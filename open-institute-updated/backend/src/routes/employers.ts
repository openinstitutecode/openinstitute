import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireRole, AuthedRequest } from "../middleware/auth.js";

export const employersRouter = Router();

employersRouter.get("/postings", async (_req, res) => {
  const postings = await prisma.internshipPosting.findMany({
    where: { status: "open" },
    include: { employer: true },
    orderBy: { postedAt: "desc" },
  });
  res.json(postings);
});

const postingSchema = z.object({
  title: z.string().min(2),
  description: z.string().min(2),
  slots: z.number().int().positive().default(1),
  skillsRequired: z.array(z.string()).default([]),
});

employersRouter.post("/postings", requireAuth, requireRole("EMPLOYER"), async (req: AuthedRequest, res) => {
  const parsed = postingSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid posting." });

  const profile = await prisma.employerProfile.findUnique({ where: { userId: req.user!.id } });
  if (!profile) return res.status(400).json({ message: "No employer profile linked to this account." });

  const posting = await prisma.internshipPosting.create({
    data: { ...parsed.data, employerId: profile.employerId },
  });
  res.status(201).json(posting);
});

employersRouter.get(
  "/placements",
  requireAuth,
  requireRole("EMPLOYER", "ATTACHMENT_OFFICER", "SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    const where =
      req.user!.role === "EMPLOYER"
        ? {
            employer: {
              employerProfile: { userId: req.user!.id },
            },
          }
        : {};
    const placements = await prisma.attachmentPlacement.findMany({
      where,
      include: { student: true, logbookEntries: true },
    });
    res.json(placements);
  }
);

// Employer supervisor signs off a logbook entry — the honesty check a
// college inspector would actually look for: entries aren't self-certified.
employersRouter.patch("/logbook/:entryId/sign-off", requireAuth, requireRole("EMPLOYER", "ATTACHMENT_OFFICER", "SUPER_ADMIN"), async (req: AuthedRequest, res) => {
  const entry = await prisma.logbookEntry.update({
    where: { id: req.params.entryId },
    data: { supervisorSignOff: true },
  });
  res.json(entry);
});

const matchSchema = z.object({ postingId: z.string() });

// AI candidate matching, done honestly: real rule-based overlap between the
// posting's required skills and the student's own competency-passport
// entries — not an AI call, just set intersection. Simple, explainable,
// and correct, rather than dressed up as "AI matching" when it's really a
// lookup.
employersRouter.get("/postings/:postingId/matches", requireAuth, requireRole("EMPLOYER", "ATTACHMENT_OFFICER", "SUPER_ADMIN"), async (req: AuthedRequest, res) => {
  const posting = await prisma.internshipPosting.findUnique({ where: { id: req.params.postingId } });
  if (!posting) return res.status(404).json({ message: "Posting not found." });

  if (posting.skillsRequired.length === 0) {
    return res.json({ message: "This posting has no required skills listed, so nothing to match against.", matches: [] });
  }

  const students = await prisma.student.findMany({
    where: { academicStatus: "ACTIVE" },
    include: { competencyRecords: { include: { competency: true } } },
  });

  const required = posting.skillsRequired.map((s) => s.toLowerCase());
  const matches = students
    .map((s) => {
      const owned = s.competencyRecords
        .filter((r) => r.level !== "developing")
        .map((r) => r.competency.name.toLowerCase());
      const matched = required.filter((skill) => owned.some((o) => o.includes(skill) || skill.includes(o)));
      return {
        studentId: s.id,
        fullName: s.fullName,
        studentNumber: s.studentNumber,
        matchedSkills: matched,
        matchPercent: Math.round((matched.length / required.length) * 100),
      };
    })
    .filter((m) => m.matchPercent > 0)
    .sort((a, b) => b.matchPercent - a.matchPercent);

  res.json({ matches });
});

// ---------------------------------------------------------------------------
// SP038 — real applications, distinct from the auto-computed match score
// above. A match percent is a suggestion; an application is an expressed
// intent to apply, which an employer (or attachment officer) then decides
// on. Deciding "accepted" is the one place in this codebase that actually
// creates an AttachmentPlacement — every other placement view (Employer
// Placements, Student Attachment) only ever read that model, nothing
// wrote to it.
// ---------------------------------------------------------------------------

const applySchema = z.object({ coverNote: z.string().optional() });

employersRouter.post("/postings/:postingId/apply", requireAuth, async (req: AuthedRequest, res) => {
  const student = await prisma.student.findUnique({ where: { userId: req.user!.id } });
  if (!student) return res.status(403).json({ message: "Only students can apply to postings." });

  const posting = await prisma.internshipPosting.findUnique({ where: { id: req.params.postingId } });
  if (!posting || posting.status !== "open") return res.status(404).json({ message: "That posting isn't open." });

  const parsed = applySchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ message: "Invalid application." });

  const application = await prisma.internshipApplication
    .create({
      data: { studentId: student.id, postingId: posting.id, coverNote: parsed.data.coverNote },
    })
    .catch(() => null);
  if (!application) return res.status(409).json({ message: "You've already applied to this posting." });

  res.status(201).json(application);
});

employersRouter.get("/applications/mine", requireAuth, async (req: AuthedRequest, res) => {
  const student = await prisma.student.findUnique({ where: { userId: req.user!.id } });
  if (!student) return res.status(404).json({ message: "No student record for this account." });

  const applications = await prisma.internshipApplication.findMany({
    where: { studentId: student.id },
    include: { posting: { include: { employer: true } } },
    orderBy: { appliedAt: "desc" },
  });
  res.json(applications);
});

employersRouter.get(
  "/postings/:postingId/applications",
  requireAuth,
  requireRole("EMPLOYER", "ATTACHMENT_OFFICER", "SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    const posting = await prisma.internshipPosting.findUnique({ where: { id: req.params.postingId } });
    if (!posting) return res.status(404).json({ message: "No such posting." });

    if (req.user!.role === "EMPLOYER") {
      const profile = await prisma.employerProfile.findUnique({ where: { userId: req.user!.id } });
      if (!profile || profile.employerId !== posting.employerId) {
        return res.status(403).json({ message: "That posting doesn't belong to your organization." });
      }
    }

    const applications = await prisma.internshipApplication.findMany({
      where: { postingId: posting.id },
      include: { student: { select: { fullName: true, studentNumber: true } } },
      orderBy: { appliedAt: "asc" },
    });
    res.json(applications);
  }
);

const decideSchema = z.object({
  status: z.enum(["shortlisted", "accepted", "rejected"]),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  supervisorName: z.string().optional(),
});

employersRouter.patch(
  "/applications/:id/decide",
  requireAuth,
  requireRole("EMPLOYER", "ATTACHMENT_OFFICER", "SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    const parsed = decideSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Provide a valid status." });

    const application = await prisma.internshipApplication.findUnique({
      where: { id: req.params.id },
      include: { posting: true },
    });
    if (!application) return res.status(404).json({ message: "No such application." });

    if (req.user!.role === "EMPLOYER") {
      const profile = await prisma.employerProfile.findUnique({ where: { userId: req.user!.id } });
      if (!profile || profile.employerId !== application.posting.employerId) {
        return res.status(403).json({ message: "That application doesn't belong to your organization's posting." });
      }
    }

    if (parsed.data.status === "accepted") {
      if (!parsed.data.startDate || !parsed.data.endDate) {
        return res.status(400).json({ message: "Accepting an application requires startDate and endDate to create the placement." });
      }
      const [updated, placement] = await prisma.$transaction([
        prisma.internshipApplication.update({
          where: { id: application.id },
          data: { status: "accepted", decidedAt: new Date(), decidedById: req.user!.id },
        }),
        prisma.attachmentPlacement.create({
          data: {
            studentId: application.studentId,
            employerId: application.posting.employerId,
            supervisorName: parsed.data.supervisorName,
            startDate: new Date(parsed.data.startDate),
            endDate: new Date(parsed.data.endDate),
            status: "pending",
          },
        }),
      ]);
      await prisma.auditLog.create({
        data: {
          userId: req.user!.id,
          action: "INTERNSHIP_APPLICATION_ACCEPTED",
          entityType: "InternshipApplication",
          entityId: updated.id,
          metadata: { placementId: placement.id },
        },
      });
      return res.json({ application: updated, placement });
    }

    const updated = await prisma.internshipApplication.update({
      where: { id: application.id },
      data: { status: parsed.data.status, decidedAt: new Date(), decidedById: req.user!.id },
    });
    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        action: parsed.data.status === "rejected" ? "INTERNSHIP_APPLICATION_REJECTED" : "INTERNSHIP_APPLICATION_SHORTLISTED",
        entityType: "InternshipApplication",
        entityId: updated.id,
      },
    });
    res.json({ application: updated });
  }
);

// Student self-service candidate-matching against all open postings.
employersRouter.get("/postings/matches/mine", requireAuth, async (req: AuthedRequest, res) => {
  const student = await prisma.student.findUnique({
    where: { userId: req.user!.id },
    include: { competencyRecords: { include: { competency: true }, where: { level: { not: "developing" } } } },
  });
  if (!student) return res.status(404).json({ message: "No student record for this account." });

  const owned = student.competencyRecords.map((r) => r.competency.name.toLowerCase());
  const postings = await prisma.internshipPosting.findMany({ where: { status: "open" }, include: { employer: true } });

  const matches = postings
    .map((p) => {
      if (p.skillsRequired.length === 0) return { posting: p, matchPercent: null };
      const required = p.skillsRequired.map((s) => s.toLowerCase());
      const matched = required.filter((skill) => owned.some((o) => o.includes(skill) || skill.includes(o)));
      return { posting: p, matchPercent: Math.round((matched.length / required.length) * 100) };
    })
    .sort((a, b) => (b.matchPercent ?? 0) - (a.matchPercent ?? 0));

  res.json(matches);
});
