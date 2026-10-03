import { Router, Request, Response } from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { prisma } from "../lib/prisma.js";
import { comparableText, jaccardSimilarity, shingleSimilarity, findOverlappingSegments } from "../lib/similarity.js";

const router = Router();

// EX032 -- Similarity checking: word-overlap plagiarism detection
// NOTE: This is an HONEST implementation using word-overlap only.
// It does NOT do semantic/paraphrase detection. Results are for review, not enforcement.
// Pure scoring/text-extraction logic lives in ../lib/similarity.ts and is unit-tested there.

// Check submission against all others in the same assessment
router.post(
  "/:submissionId/check",
  requireAuth,
  requireRole("EXAMINATION_OFFICER", "TRAINER", "SUPER_ADMIN"),
  async (req: Request, res: Response) => {
    try {
      const { submissionId } = req.params;

      const submission = await prisma.submission.findUnique({
        where: { id: submissionId },
        include: { questionResponses: { select: { questionId: true, answerGiven: true } } },
      });

      if (!submission) {
        return res.status(404).json({ error: "Submission not found" });
      }
      if (!submission.assessmentId) {
        return res.json({
          message: "This submission isn't linked to an assessment (it's an assignment submission), so there is nothing to compare it against.",
          similarityChecks: [],
        });
      }

      // BUGFIX: previously only `submission.textAnswer` was read, so exam
      // submissions (whose answers live in QuestionResponse rows) always
      // compared as empty and never got checked at all.
      const submissionText = comparableText(submission);
      if (!submissionText) {
        return res.json({
          message: "Submission has no text or answers to check",
          similarityChecks: [],
        });
      }

      const otherSubmissions = await prisma.submission.findMany({
        where: {
          assessmentId: submission.assessmentId,
          id: { not: submissionId },
        },
        include: { questionResponses: { select: { questionId: true, answerGiven: true } } },
      });

      const similarityChecks = [];

      for (const other of otherSubmissions) {
        const otherText = comparableText(other);
        if (!otherText) continue;

        const score = jaccardSimilarity(submissionText, otherText);
        // EX032 upgrade — a second, order-sensitive pass. Two submissions
        // can share plenty of common words (a high bag-of-words score)
        // without actually being copied, or share fewer individual words
        // but the *same run of phrasing* reordered — the shingle score
        // catches more of the second case. Either metric crossing its own
        // threshold is enough to flag for human review.
        const shingleScore = shingleSimilarity(submissionText, otherText);
        const flagged = score > 70 || shingleScore > 55;
        const segments = flagged ? findOverlappingSegments(submissionText, otherText) : [];

        const check = await prisma.similarityCheck.upsert({
          where: {
            submissionId_pairedSubmissionId: {
              submissionId,
              pairedSubmissionId: other.id,
            },
          },
          create: {
            assessmentId: submission.assessmentId,
            submissionId,
            pairedSubmissionId: other.id,
            similarityScore: score,
            overlappingSegments: JSON.stringify({ segments, shingleScore: Math.round(shingleScore) }),
            checkMethod: "word_overlap+shingle",
          },
          update: {
            similarityScore: score,
            overlappingSegments: JSON.stringify({ segments, shingleScore: Math.round(shingleScore) }),
          },
        });

        if (flagged) {
          await prisma.submission.update({
            where: { id: submissionId },
            data: { integrityFlag: true },
          });

          // BUGFIX: AuditLog's real columns are entityType/entityId/metadata
          // (Json) -- the old code wrote sourceType/sourceId/details, which
          // don't exist on the model, so this insert threw a Prisma
          // validation error on every high-similarity match (i.e. exactly
          // the case this endpoint most needs to survive).
          await prisma.auditLog.create({
            data: {
              userId: (req as any).user?.id,
              action: "SIMILARITY_FLAG_CREATED",
              entityType: "SUBMISSION",
              entityId: submissionId,
              metadata: {
                pairedSubmissionId: other.id,
                similarityScorePercent: Math.round(score),
                shingleScorePercent: Math.round(shingleScore),
              },
            },
          });
        }

        similarityChecks.push(check);
      }

      res.json({
        submissionId,
        checksPerformed: similarityChecks.length,
        highSimilarityCount: similarityChecks.filter((c) => c.similarityScore > 70).length,
        similarityChecks,
        note: "Similarity checking uses word-overlap (bag-of-words) and shingle (n-gram) metrics only. Semantic/paraphrase detection is NOT performed.",
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);

// Get all similarity checks for an assessment
router.get(
  "/assessment/:assessmentId",
  requireAuth,
  requireRole("EXAMINATION_OFFICER", "TRAINER", "SUPER_ADMIN"),
  async (req: Request, res: Response) => {
    try {
      const { assessmentId } = req.params;
      const { minScore } = req.query;

      const where: any = { assessmentId };
      if (minScore) {
        where.similarityScore = { gte: parseFloat(minScore as string) };
      }

      const checks = await prisma.similarityCheck.findMany({
        where,
        include: {
          submission: { select: { studentUserId: true } },
          pairedSubmission: { select: { studentUserId: true } },
        },
        orderBy: { similarityScore: "desc" },
      });

      res.json(checks);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);

// Get similarity report for a pair of submissions
router.get(
  "/:checkId",
  requireAuth,
  requireRole("EXAMINATION_OFFICER", "TRAINER", "SUPER_ADMIN"),
  async (req: Request, res: Response) => {
    try {
      const { checkId } = req.params;

      const check = await prisma.similarityCheck.findUnique({
        where: { id: checkId },
        include: { submission: true, pairedSubmission: true },
      });

      if (!check) {
        return res.status(404).json({ error: "Similarity check not found" });
      }

      res.json(check);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);

// Mark a similarity check as reviewed
router.patch(
  "/:checkId/review",
  requireAuth,
  requireRole("EXAMINATION_OFFICER", "TRAINER", "SUPER_ADMIN"),
  async (req: Request, res: Response) => {
    try {
      const { checkId } = req.params;

      const check = await prisma.similarityCheck.update({
        where: { id: checkId },
        data: {
          reviewedBy: (req as any).user?.id,
          reviewedAt: new Date(),
        },
      });

      res.json(check);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);

export default router;
