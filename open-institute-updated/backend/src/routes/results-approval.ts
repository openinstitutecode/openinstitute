import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireRole, AuthedRequest } from "../middleware/auth.js";
import { finalizeCourseResults, getCourseProcessingStatus } from "../lib/results-processing.js";

// ---------------------------------------------------------------------------
// RG027 — Results approval. `ResultsApprovalChain` (examiner1 → examiner2
// → QA officer, with a comment and timestamp recorded at every stage) has
// existed in the schema since Batch 44, but nothing ever created, read, or
// advanced one — a dead model exactly like EX004's learning-outcomes.ts was
// a dead file before Batch 48. This is that wiring. It sits alongside, and
// does not replace, TP032's simpler Assessment.resultsSubmittedForApprovalAt
// single-approval flag: this is the real multi-stage sign-off the tracking
// doc calls out as missing, and reaching the final PUBLISHED stage here
// also sets Assessment.resultsApprovedAt so every existing screen that
// already reads that single flag keeps working without changes.
// ---------------------------------------------------------------------------

export const resultsApprovalRouter = Router();

const STAGE_ORDER = ["SUBMITTED", "EXAMINER_1", "EXAMINER_2", "QA_OFFICER", "PUBLISHED"] as const;

resultsApprovalRouter.post(
  "/:assessmentId/submit",
  requireAuth,
  requireRole("TRAINER", "SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    const assessment = await prisma.assessment.findUnique({ where: { id: req.params.assessmentId } });
    if (!assessment) return res.status(404).json({ message: "Assessment not found." });
    // Reuses TP032's own "all submissions graded" gate rather than
    // duplicating that check here — a trainer must already have used the
    // existing Submit-for-approval action before this richer chain starts.
    if (!assessment.resultsSubmittedForApprovalAt) {
      return res.status(400).json({ message: "Submit this assessment for approval from the gradebook first." });
    }

    const existing = await prisma.resultsApprovalChain.findUnique({ where: { assessmentId: assessment.id } });
    if (existing) return res.status(409).json({ message: "Results for this assessment are already in the approval chain." });

    const chain = await prisma.resultsApprovalChain.create({
      data: { assessmentId: assessment.id, submittedBy: assessment.resultsSubmittedById ?? req.user!.id, currentStage: "SUBMITTED" },
    });

    res.status(201).json(chain);
  }
);

// Chains waiting on the caller's role to act next. EXAMINATION_OFFICER
// covers both examiner stages (a real institution would name two distinct
// examiners; this app has one EXAMINATION_OFFICER role, so the same role
// clears both stages in sequence — still two distinct, separately-recorded
// sign-offs, just not two distinct role names).
resultsApprovalRouter.get(
  "/pending",
  requireAuth,
  requireRole("EXAMINATION_OFFICER", "QA_OFFICER", "REGISTRAR", "SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    const stageForRole =
      req.user!.role === "QA_OFFICER"
        ? ["EXAMINER_2"]
        : req.user!.role === "SUPER_ADMIN" || req.user!.role === "REGISTRAR"
        ? ["SUBMITTED", "EXAMINER_1", "EXAMINER_2"]
        : ["SUBMITTED", "EXAMINER_1"];

    // Batch 53 bug fix: this used to select `unit` directly off Assessment
    // (`assessment: { select: { ..., unit: {...} } }`), but Assessment has
    // no `unit` relation — only `course`, which itself has `unit`. Prisma
    // rejects an unknown field in a select, so this route 500'd on every
    // real call; it could never have returned a single chain. Fixed by
    // going through `course.unit` and reshaping to the same response shape
    // the frontend already expects, so no client change is needed.
    const chains = await prisma.resultsApprovalChain.findMany({
      where: { currentStage: { in: stageForRole } },
      include: {
        assessment: {
          select: {
            id: true,
            title: true,
            type: true,
            totalMarks: true,
            courseId: true,
            course: { select: { unit: { select: { code: true, title: true } } } },
          },
        },
      },
      orderBy: { submittedAt: "asc" },
    });

    res.json(
      chains.map((c) => ({
        ...c,
        assessment: {
          id: c.assessment.id,
          title: c.assessment.title,
          type: c.assessment.type,
          totalMarks: c.assessment.totalMarks,
          courseId: c.assessment.courseId,
          unit: c.assessment.course.unit,
        },
      }))
    );
  }
);

resultsApprovalRouter.get(
  "/:assessmentId",
  requireAuth,
  requireRole("TRAINER", "EXAMINATION_OFFICER", "QA_OFFICER", "REGISTRAR", "SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    const chain = await prisma.resultsApprovalChain.findUnique({
      where: { assessmentId: req.params.assessmentId },
      include: { examiner1: { select: { email: true } }, examiner2: { select: { email: true } }, qaOfficer: { select: { email: true } } },
    });
    if (!chain) return res.status(404).json({ message: "No approval chain for this assessment yet." });
    res.json(chain);
  }
);

const advanceSchema = z.object({
  decision: z.enum(["approve", "reject"]),
  comment: z.string().min(3),
});

resultsApprovalRouter.patch(
  "/:id/advance",
  requireAuth,
  requireRole("EXAMINATION_OFFICER", "QA_OFFICER", "SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    const parsed = advanceSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Provide a decision and a comment." });

    const chain = await prisma.resultsApprovalChain.findUnique({
      where: { id: req.params.id },
      include: { assessment: { select: { courseId: true } } },
    });
    if (!chain) return res.status(404).json({ message: "Approval chain not found." });
    if (chain.currentStage === "PUBLISHED") return res.status(409).json({ message: "Results are already published." });

    // Reject at any stage sends it back to the start — the trainer has to
    // resubmit after fixing whatever the reviewer flagged, never a silent
    // "stay where it was" state that could be re-approved without a fix.
    if (parsed.data.decision === "reject") {
      const updated = await prisma.resultsApprovalChain.update({
        where: { id: chain.id },
        data: { currentStage: "SUBMITTED", rejectionReason: parsed.data.comment, isApproved: false },
      });
      return res.json(updated);
    }

    if (chain.currentStage === "SUBMITTED") {
      if (chain.submittedBy === req.user!.id) {
        return res.status(403).json({ message: "The trainer who submitted results can't also act as their first examiner." });
      }
      const updated = await prisma.resultsApprovalChain.update({
        where: { id: chain.id },
        data: { currentStage: "EXAMINER_1", examiner1Id: req.user!.id, examiner1At: new Date(), examiner1Comment: parsed.data.comment },
      });
      return res.json(updated);
    }

    if (chain.currentStage === "EXAMINER_1") {
      if (chain.examiner1Id === req.user!.id) {
        return res.status(403).json({ message: "The first examiner can't also be the second." });
      }
      const updated = await prisma.resultsApprovalChain.update({
        where: { id: chain.id },
        data: { currentStage: "EXAMINER_2", examiner2Id: req.user!.id, examiner2At: new Date(), examiner2Comment: parsed.data.comment },
      });
      return res.json(updated);
    }

    if (chain.currentStage === "EXAMINER_2") {
      if (req.user!.role !== "QA_OFFICER" && req.user!.role !== "SUPER_ADMIN") {
        return res.status(403).json({ message: "Only a QA officer can give the final sign-off." });
      }
      const [updated] = await prisma.$transaction([
        prisma.resultsApprovalChain.update({
          where: { id: chain.id },
          data: {
            currentStage: "PUBLISHED",
            qaOfficerId: req.user!.id,
            qaOfficerAt: new Date(),
            qaOfficerComment: parsed.data.comment,
            isApproved: true,
          },
        }),
        prisma.assessment.update({
          where: { id: chain.assessmentId },
          data: { resultsApprovedAt: new Date(), resultsApprovedById: req.user!.id, resultsApprovalNote: parsed.data.comment },
        }),
      ]);

      // RG025 — a QA-officer sign-off is exactly the trigger point for
      // turning approved marks into final academic records. Best-effort:
      // if this course has other assessments still pending approval,
      // finalizeCourseResults() correctly no-ops (returns all-zero counts)
      // rather than writing a partial grade, and a genuine failure here
      // must not undo the sign-off that already happened above.
      let resultsProcessing = null;
      try {
        resultsProcessing = await finalizeCourseResults(chain.assessment.courseId);
      } catch (err) {
        console.error("RG025 finalizeCourseResults failed after publish:", err);
      }

      return res.json({ ...updated, resultsProcessing });
    }

    res.status(409).json({ message: "This chain is not in a state that can be advanced." });
  }
);

// RG025 — course-level results processing status and a manual finalize
// action. The automatic path above covers a normal QA sign-off; this
// covers the edge cases: an assessment approved through the older single-
// flag path (TP032, no ResultsApprovalChain at all), a submission graded
// late after the chain already published, or a registrar/exam officer who
// wants to force a recompute after a results amendment (RG026).
resultsApprovalRouter.get(
  "/course/:courseId/status",
  requireAuth,
  requireRole("TRAINER", "EXAMINATION_OFFICER", "QA_OFFICER", "REGISTRAR", "SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    const status = await getCourseProcessingStatus(req.params.courseId);
    if (!status) return res.status(404).json({ message: "Course not found." });
    res.json(status);
  }
);

const finalizeSchema = z.object({ force: z.boolean().optional() });

resultsApprovalRouter.post(
  "/course/:courseId/finalize",
  requireAuth,
  requireRole("EXAMINATION_OFFICER", "REGISTRAR", "SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    const parsed = finalizeSchema.safeParse(req.body ?? {});
    const force = parsed.success ? Boolean(parsed.data.force) : false;

    try {
      const result = await finalizeCourseResults(req.params.courseId, { force });

      await prisma.auditLog.create({
        data: {
          userId: req.user!.id,
          action: "RESULTS_PROCESSING_FINALIZED",
          entityType: "Course",
          entityId: req.params.courseId,
          metadata: result,
        },
      });

      return res.json(result);
    } catch (err) {
      return res.status(404).json({ message: err instanceof Error ? err.message : "Could not finalize results." });
    }
  }
);
