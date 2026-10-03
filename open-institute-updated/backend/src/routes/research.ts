import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { loadProjectAccess } from "../lib/access.js";
import { requireAuth, requireRole, AuthedRequest } from "../middleware/auth.js";

export const researchRouter = Router();

// KSEC-007 — project sub-resources (notes, bibliography, matrix, milestones, ethics, mentorships) belong to the project's lead,
// its supervisor and oversight staff. A project you can't access is reported as missing, not forbidden.
async function projectGate(req: AuthedRequest, res: import("express").Response, projectId: string) {
  const access = await loadProjectAccess(req.user!, projectId);
  if (access !== "ok") { res.status(404).json({ message: "Project not found.", code: "NOT_FOUND" }); return false; }
  return true;
}


const projectSchema = z.object({
  title: z.string().min(3),
  type: z.enum(["student_research", "trainer_research", "innovation", "startup"]),
  abstract: z.string().optional(),
  ethicsRequired: z.boolean().default(false),
});

// LB024 — research proposal workflow: anyone signed in can submit a
// proposal; it starts unsupervised and unapproved.
researchRouter.post("/projects", requireAuth, async (req: AuthedRequest, res) => {
  const parsed = projectSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid research proposal." });

  const project = await prisma.researchProject.create({
    data: { ...parsed.data, leadUserId: req.user!.id },
  });
  res.status(201).json(project);
});

researchRouter.get("/projects/mine", requireAuth, async (req: AuthedRequest, res) => {
  const projects = await prisma.researchProject.findMany({
    where: { leadUserId: req.user!.id },
    include: { milestones: true, publications: true },
    orderBy: { createdAt: "desc" },
  });
  res.json(projects);
});

researchRouter.get(
  "/projects",
  requireAuth,
  requireRole("PROGRAMME_COORDINATOR", "DEPARTMENT_HEAD", "SUPER_ADMIN"),
  async (_req: AuthedRequest, res) => {
    const projects = await prisma.researchProject.findMany({
      include: { supervisor: true, milestones: true, publications: true },
      orderBy: { createdAt: "desc" },
    });
    res.json(projects);
  }
);

// LB025 — supervisor assignment.
const assignSchema = z.object({ supervisorId: z.string() });

researchRouter.patch(
  "/projects/:id/supervisor",
  requireAuth,
  requireRole("PROGRAMME_COORDINATOR", "DEPARTMENT_HEAD", "SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    const parsed = assignSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Choose a supervisor." });
    const project = await prisma.researchProject.update({
      where: { id: req.params.id },
      data: { supervisorId: parsed.data.supervisorId, status: "approved" },
    });
    res.json(project);
  }
);

// ---------------------------------------------------------------------------
// LB027 — ethics workflow. A researcher submits a real protocol (what will
// be done and how risks are mitigated); a reviewer moves it through actual
// committee states and only assigns a protocol number on approval. This
// replaces the old single-boolean approve gate: a project can now be sent
// back for revisions and resubmitted, and every decision is kept as
// history rather than overwriting one flag. ethicsApproved on the project
// stays in sync with the latest submission's outcome so existing gates
// elsewhere in the codebase (alerts, dashboards) keep working unchanged.
// ---------------------------------------------------------------------------
const ethicsSubmissionSchema = z.object({
  summary: z.string().min(10),
  risksAndMitigation: z.string().optional(),
});

researchRouter.post("/projects/:id/ethics-submissions", requireAuth, async (req: AuthedRequest, res) => {
  if (!(await projectGate(req, res, req.params.id))) return;
  const project = await prisma.researchProject.findUnique({ where: { id: req.params.id } });
  if (!project) return res.status(404).json({ message: "Project not found." });
  if (project.leadUserId !== req.user!.id) return res.status(403).json({ message: "Only the project lead can submit for ethics review." });

  const parsed = ethicsSubmissionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Describe what will be done and provide enough detail to review." });

  const submission = await prisma.ethicsSubmission.create({
    data: { projectId: project.id, summary: parsed.data.summary, risksAndMitigation: parsed.data.risksAndMitigation },
  });
  // A fresh submission always reopens review — a previous rejection or
  // approval never silently carries over to a new protocol.
  await prisma.researchProject.update({ where: { id: project.id }, data: { ethicsRequired: true, ethicsApproved: false } });
  res.status(201).json(submission);
});

researchRouter.get("/projects/:id/ethics-submissions", requireAuth, async (req: AuthedRequest, res) => {
  if (!(await projectGate(req, res, req.params.id))) return;
  const project = await prisma.researchProject.findUnique({ where: { id: req.params.id } });
  if (!project) return res.status(404).json({ message: "Project not found." });
  const isCommittee = ["QA_OFFICER", "PRINCIPAL", "DEPARTMENT_HEAD", "SUPER_ADMIN"].includes(req.user!.role);
  if (project.leadUserId !== req.user!.id && !isCommittee) return res.status(403).json({ message: "Not authorized to view this project's ethics history." });

  const submissions = await prisma.ethicsSubmission.findMany({
    where: { projectId: project.id },
    orderBy: { submittedAt: "desc" },
  });
  res.json(submissions);
});

// Committee-facing queue: every submission still awaiting a decision,
// across all projects — real submitted/under_review rows, not a guess.
researchRouter.get(
  "/ethics-submissions/pending",
  requireAuth,
  requireRole("QA_OFFICER", "PRINCIPAL", "DEPARTMENT_HEAD", "SUPER_ADMIN"),
  async (_req: AuthedRequest, res) => {
    const submissions = await prisma.ethicsSubmission.findMany({
      where: { status: { in: ["submitted", "under_review"] } },
      include: { project: { select: { id: true, title: true, type: true } } },
      orderBy: { submittedAt: "asc" },
    });
    res.json(submissions);
  }
);

const ethicsDecisionSchema = z.object({
  status: z.enum(["under_review", "revisions_requested", "approved", "rejected"]),
  protocolNumber: z.string().optional(),
  decisionNotes: z.string().optional(),
});

researchRouter.patch(
  "/ethics-submissions/:id/decision",
  requireAuth,
  requireRole("QA_OFFICER", "PRINCIPAL", "DEPARTMENT_HEAD", "SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    const parsed = ethicsDecisionSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Choose a valid decision." });
    if (parsed.data.status === "approved" && !parsed.data.protocolNumber) {
      return res.status(400).json({ message: "Assign a protocol number when approving." });
    }

    const submission = await prisma.ethicsSubmission.findUnique({ where: { id: req.params.id } });
    if (!submission) return res.status(404).json({ message: "Submission not found." });

    const isFinal = parsed.data.status === "approved" || parsed.data.status === "rejected";
    const updated = await prisma.ethicsSubmission.update({
      where: { id: submission.id },
      data: {
        status: parsed.data.status,
        protocolNumber: parsed.data.status === "approved" ? parsed.data.protocolNumber : submission.protocolNumber,
        decisionNotes: parsed.data.decisionNotes,
        decidedById: isFinal ? req.user!.id : undefined,
        decidedAt: isFinal ? new Date() : undefined,
      },
    });
    await prisma.researchProject.update({
      where: { id: submission.projectId },
      data: { ethicsApproved: parsed.data.status === "approved" },
    });
    res.json(updated);
  }
);

const milestoneSchema = z.object({ title: z.string().min(2), dueDate: z.string().datetime().optional() });

researchRouter.post("/projects/:id/milestones", requireAuth, async (req: AuthedRequest, res) => {
  if (!(await projectGate(req, res, req.params.id))) return;
  const parsed = milestoneSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid milestone." });
  const milestone = await prisma.researchMilestone.create({
    data: {
      projectId: req.params.id,
      title: parsed.data.title,
      dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : undefined,
    },
  });
  res.status(201).json(milestone);
});

researchRouter.patch("/milestones/:id/done", requireAuth, async (req: AuthedRequest, res) => {
  const ms = await prisma.researchMilestone.findUnique({ where: { id: req.params.id }, select: { projectId: true } });
  if (!ms || !(await projectGate(req, res, ms.projectId))) { if (!ms) res.status(404).json({ message: "Milestone not found.", code: "NOT_FOUND" }); return; }
  const milestone = await prisma.researchMilestone.update({
    where: { id: req.params.id },
    data: { status: "done" },
  });
  res.json(milestone);
});

// LB028 — publication tracking.
const publicationSchema = z.object({
  projectId: z.string().optional(),
  title: z.string().min(3),
  authors: z.array(z.string()).min(1),
  venue: z.string().optional(),
  year: z.number().int().optional(),
  url: z.string().url().optional(),
});

researchRouter.post("/publications", requireAuth, async (req: AuthedRequest, res) => {
  const parsed = publicationSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid publication record." });
  const publication = await prisma.publication.create({ data: parsed.data });
  res.status(201).json(publication);
});

researchRouter.get("/publications", requireAuth, async (_req, res) => {
  const publications = await prisma.publication.findMany({ orderBy: { year: "desc" } });
  res.json(publications);
});

// ---------------------------------------------------------------------------
// LB016 — research notebook, LB018 — bibliography manager, LB019 —
// literature matrix. All three are real entries a researcher writes
// themselves against a specific project — nothing here is AI-generated
// or inferred from content the system doesn't actually have indexed.
// ---------------------------------------------------------------------------

const noteSchema = z.object({ title: z.string().min(1), content: z.string().min(1) });

researchRouter.post("/projects/:id/notes", requireAuth, async (req: AuthedRequest, res) => {
  if (!(await projectGate(req, res, req.params.id))) return;
  const parsed = noteSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Provide a title and content." });
  const note = await prisma.researchNote.create({
    data: { projectId: req.params.id, authorUserId: req.user!.id, ...parsed.data },
  });
  res.status(201).json(note);
});

researchRouter.get("/projects/:id/notes", requireAuth, async (req: AuthedRequest, res) => {
  if (!(await projectGate(req, res, req.params.id))) return;
  const notes = await prisma.researchNote.findMany({ where: { projectId: req.params.id }, orderBy: { createdAt: "desc" } });
  res.json(notes);
});

const bibliographySchema = z.object({
  sourceType: z.enum(["book", "journal_article", "website", "report", "other"]),
  title: z.string().min(1),
  author: z.string().optional(),
  year: z.number().int().optional(),
  publisher: z.string().optional(),
  url: z.string().url().optional(),
});

researchRouter.post("/projects/:id/bibliography", requireAuth, async (req: AuthedRequest, res) => {
  if (!(await projectGate(req, res, req.params.id))) return;
  const parsed = bibliographySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Provide sourceType and title at minimum." });
  const entry = await prisma.bibliographyEntry.create({ data: { projectId: req.params.id, ...parsed.data } });
  res.status(201).json(entry);
});

researchRouter.get("/projects/:id/bibliography", requireAuth, async (req: AuthedRequest, res) => {
  if (!(await projectGate(req, res, req.params.id))) return;
  const entries = await prisma.bibliographyEntry.findMany({ where: { projectId: req.params.id }, orderBy: { addedAt: "desc" } });
  res.json(entries);
});

const matrixSchema = z.object({
  sourceTitle: z.string().min(1),
  author: z.string().optional(),
  year: z.number().int().optional(),
  methodology: z.string().optional(),
  keyFindings: z.string().optional(),
  relevanceNote: z.string().optional(),
});

researchRouter.post("/projects/:id/literature-matrix", requireAuth, async (req: AuthedRequest, res) => {
  if (!(await projectGate(req, res, req.params.id))) return;
  const parsed = matrixSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Provide at least sourceTitle." });
  const entry = await prisma.literatureMatrixEntry.create({ data: { projectId: req.params.id, ...parsed.data } });
  res.status(201).json(entry);
});

researchRouter.get("/projects/:id/literature-matrix", requireAuth, async (req: AuthedRequest, res) => {
  if (!(await projectGate(req, res, req.params.id))) return;
  const entries = await prisma.literatureMatrixEntry.findMany({ where: { projectId: req.params.id }, orderBy: { addedAt: "desc" } });
  res.json(entries);
});

// ---------------------------------------------------------------------------
// LB029 — conference management: real deadlines, real submission tracking.
// ---------------------------------------------------------------------------

const conferenceSchema = z.object({
  name: z.string().min(2),
  location: z.string().optional(),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  submissionDeadline: z.string().datetime().optional(),
  url: z.string().url().optional(),
});

researchRouter.post(
  "/conferences",
  requireAuth,
  requireRole("PROGRAMME_COORDINATOR", "DEPARTMENT_HEAD", "SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    const parsed = conferenceSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Provide name, startDate, and endDate." });
    const conference = await prisma.conference.create({
      data: {
        ...parsed.data,
        startDate: new Date(parsed.data.startDate),
        endDate: new Date(parsed.data.endDate),
        submissionDeadline: parsed.data.submissionDeadline ? new Date(parsed.data.submissionDeadline) : undefined,
      },
    });
    res.status(201).json(conference);
  }
);

researchRouter.get("/conferences", requireAuth, async (_req, res) => {
  const conferences = await prisma.conference.findMany({ orderBy: { startDate: "asc" } });
  res.json(conferences);
});

const submissionSchema = z.object({ conferenceId: z.string(), projectId: z.string(), title: z.string().min(2) });

researchRouter.post("/conference-submissions", requireAuth, async (req: AuthedRequest, res) => {
  const parsed = submissionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Provide conferenceId, projectId, and title." });
  const submission = await prisma.conferenceSubmission.create({
    data: { ...parsed.data, submittedById: req.user!.id },
  });
  res.status(201).json(submission);
});

researchRouter.patch(
  "/conference-submissions/:id/status",
  requireAuth,
  requireRole("PROGRAMME_COORDINATOR", "DEPARTMENT_HEAD", "SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    const parsed = z.object({ status: z.enum(["submitted", "accepted", "rejected", "presented"]) }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid status." });
    const submission = await prisma.conferenceSubmission.update({ where: { id: req.params.id }, data: { status: parsed.data.status } });
    res.json(submission);
  }
);

// ---------------------------------------------------------------------------
// LB030 — research funding: real grant status, never assumed awarded.
// ---------------------------------------------------------------------------

const grantSchema = z.object({ projectId: z.string(), funder: z.string().min(2), amount: z.number().positive() });

researchRouter.post("/grants", requireAuth, async (req: AuthedRequest, res) => {
  const parsed = grantSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Provide projectId, funder, and amount." });
  const grant = await prisma.researchGrant.create({ data: parsed.data });
  res.status(201).json(grant);
});

researchRouter.patch(
  "/grants/:id/decide",
  requireAuth,
  requireRole("PROGRAMME_COORDINATOR", "DEPARTMENT_HEAD", "SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    const parsed = z.object({ status: z.enum(["awarded", "rejected", "completed"]) }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid status." });
    const grant = await prisma.researchGrant.update({
      where: { id: req.params.id },
      data: { status: parsed.data.status, decidedAt: new Date() },
    });
    res.json(grant);
  }
);

researchRouter.get("/grants/mine", requireAuth, async (req: AuthedRequest, res) => {
  const grants = await prisma.researchGrant.findMany({
    where: { project: { leadUserId: req.user!.id } },
    include: { project: { select: { title: true } } },
    orderBy: { appliedAt: "desc" },
  });
  res.json(grants);
});

researchRouter.get(
  "/grants",
  requireAuth,
  requireRole("PROGRAMME_COORDINATOR", "DEPARTMENT_HEAD", "SUPER_ADMIN"),
  async (_req: AuthedRequest, res) => {
    const grants = await prisma.researchGrant.findMany({
      include: { project: { select: { title: true } } },
      orderBy: { appliedAt: "desc" },
    });
    res.json(grants);
  }
);

// ---------------------------------------------------------------------------
// LB034 — intellectual property: tracked at its real stage, never claimed
// granted without a real filing number.
// ---------------------------------------------------------------------------

const ipSchema = z.object({
  projectId: z.string(),
  type: z.enum(["patent", "trademark", "copyright", "trade_secret"]),
  title: z.string().min(2),
});

researchRouter.post("/intellectual-property", requireAuth, async (req: AuthedRequest, res) => {
  const parsed = ipSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Provide projectId, type, and title." });
  const ip = await prisma.intellectualProperty.create({ data: parsed.data });
  res.status(201).json(ip);
});

researchRouter.patch("/intellectual-property/:id", requireAuth, async (req: AuthedRequest, res) => {
  const rec = await prisma.intellectualProperty.findUnique({ where: { id: req.params.id }, select: { projectId: true } });
  if (!rec || !(await projectGate(req, res, rec.projectId))) { if (!rec) res.status(404).json({ message: "Record not found.", code: "NOT_FOUND" }); return; }
  const parsed = z
    .object({ filingStatus: z.enum(["idea", "filed", "granted"]), filingNumber: z.string().optional() })
    .partial()
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid update." });
  const ip = await prisma.intellectualProperty.update({
    where: { id: req.params.id },
    data: { ...parsed.data, filedAt: parsed.data.filingStatus === "filed" ? new Date() : undefined },
  });
  res.json(ip);
});

researchRouter.get("/intellectual-property/mine", requireAuth, async (req: AuthedRequest, res) => {
  const items = await prisma.intellectualProperty.findMany({
    where: { project: { leadUserId: req.user!.id } },
    include: { project: { select: { title: true } } },
    orderBy: { createdAt: "desc" },
  });
  res.json(items);
});

// ---------------------------------------------------------------------------
// LB035 — research alerts: computed from real data — milestones overdue
// or due soon, a project still requiring ethics approval, and conference
// submission deadlines approaching for the researcher's own projects.
// ---------------------------------------------------------------------------

researchRouter.get("/alerts/mine", requireAuth, async (req: AuthedRequest, res) => {
  const projects = await prisma.researchProject.findMany({
    where: { leadUserId: req.user!.id },
    include: { milestones: true },
  });

  const now = new Date();
  const in14Days = new Date(now.getTime() + 14 * 86400000);
  type Alert = { severity: "info" | "warn" | "danger"; message: string };
  const alerts: Alert[] = [];

  for (const p of projects) {
    if (p.ethicsRequired && !p.ethicsApproved) {
      alerts.push({ severity: "warn", message: `"${p.title}" still requires ethics approval before proceeding.` });
    }
    for (const m of p.milestones) {
      if (m.status === "done" || !m.dueDate) continue;
      if (m.dueDate < now) {
        alerts.push({ severity: "danger", message: `"${p.title}": milestone "${m.title}" is overdue (was due ${m.dueDate.toLocaleDateString()}).` });
      } else if (m.dueDate <= in14Days) {
        alerts.push({ severity: "warn", message: `"${p.title}": milestone "${m.title}" is due ${m.dueDate.toLocaleDateString()}.` });
      }
    }
  }

  const conferenceSubs = await prisma.conferenceSubmission.findMany({
    where: { project: { leadUserId: req.user!.id } },
    include: { conference: true, project: { select: { title: true } } },
  });
  for (const s of conferenceSubs) {
    if (s.conference.submissionDeadline && s.conference.submissionDeadline > now && s.conference.submissionDeadline <= in14Days) {
      alerts.push({ severity: "info", message: `${s.conference.name} submission deadline is ${s.conference.submissionDeadline.toLocaleDateString()}.` });
    }
  }

  res.json(alerts);
});

// ---------------------------------------------------------------------------
// LB032 — startup incubation: a real cohort/stage record tied to a
// startup-type ResearchProject. LB033 — mentorship: real mentor
// assignments with a history, distinct from a single stage snapshot.
// Both deferred from batches 29-31; built now with the same real-data
// discipline as everything else in this cluster.
// ---------------------------------------------------------------------------

const incubationSchema = z.object({ projectId: z.string(), cohort: z.string().optional(), stage: z.enum(["idea", "mvp", "growth"]).default("idea") });

researchRouter.post("/incubation", requireAuth, requireRole("PROGRAMME_COORDINATOR", "DEPARTMENT_HEAD", "SUPER_ADMIN"), async (req: AuthedRequest, res) => {
  const parsed = incubationSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Provide projectId." });
  const record = await prisma.incubationRecord.create({ data: parsed.data });
  res.status(201).json(record);
});

researchRouter.patch("/incubation/:id/stage", requireAuth, requireRole("PROGRAMME_COORDINATOR", "DEPARTMENT_HEAD", "SUPER_ADMIN"), async (req: AuthedRequest, res) => {
  const parsed = z.object({ stage: z.enum(["idea", "mvp", "growth"]) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid stage." });
  const record = await prisma.incubationRecord.update({ where: { id: req.params.id }, data: { stage: parsed.data.stage } });
  res.json(record);
});

researchRouter.get("/incubation", requireAuth, requireRole("PROGRAMME_COORDINATOR", "DEPARTMENT_HEAD", "SUPER_ADMIN"), async (_req, res) => {
  const records = await prisma.incubationRecord.findMany({
    include: { project: { select: { title: true, leadUserId: true } } },
    orderBy: { joinedAt: "desc" },
  });
  res.json(records);
});

const mentorshipSchema = z.object({ projectId: z.string(), mentorUserId: z.string(), focusArea: z.string().optional() });

researchRouter.post("/mentorships", requireAuth, requireRole("PROGRAMME_COORDINATOR", "DEPARTMENT_HEAD", "SUPER_ADMIN"), async (req: AuthedRequest, res) => {
  const parsed = mentorshipSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Provide projectId and mentorUserId." });
  const mentorship = await prisma.mentorship.create({ data: parsed.data });
  res.status(201).json(mentorship);
});

researchRouter.patch("/mentorships/:id/complete", requireAuth, requireRole("PROGRAMME_COORDINATOR", "DEPARTMENT_HEAD", "SUPER_ADMIN"), async (req: AuthedRequest, res) => {
  const mentorship = await prisma.mentorship.update({
    where: { id: req.params.id },
    data: { status: "completed", endedAt: new Date() },
  });
  res.json(mentorship);
});

researchRouter.get("/mentorships/project/:projectId", requireAuth, async (req: AuthedRequest, res) => {
  if (!(await projectGate(req, res, req.params.projectId))) return;
  const mentorships = await prisma.mentorship.findMany({
    where: { projectId: req.params.projectId },
    orderBy: { startedAt: "desc" },
  });
  res.json(mentorships);
});
