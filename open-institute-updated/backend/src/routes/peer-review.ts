import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth, AuthedRequest } from "../middleware/auth.js";
import { PEER_REVIEW_STAFF } from "../lib/access.js";

export const peerReviewRouter = Router();

const reviewSchema = z.object({
  submissionId: z.string(),
  score: z.number().min(0).max(100).optional(),
  comment: z.string().min(3),
});

// LMS033 — peer assessment. Deliberately does not touch Submission.score —
// a peer review is feedback, never the official grade. Only a trainer can
// set the grade that counts (see exams.ts).
peerReviewRouter.post("/", requireAuth, async (req: AuthedRequest, res) => {
  const parsed = reviewSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Leave a comment (and optional score) for your peer." });

  const submission = await prisma.submission.findUnique({ where: { id: parsed.data.submissionId } });
  if (!submission) return res.status(404).json({ message: "Submission not found." });
  if (submission.studentUserId === req.user!.id) {
    return res.status(400).json({ message: "You can't peer-review your own submission." });
  }

  const review = await prisma.peerReview.create({
    data: { ...parsed.data, reviewerUserId: req.user!.id },
  });
  res.status(201).json(review);
});

peerReviewRouter.get("/submission/:submissionId", requireAuth, async (req: AuthedRequest, res) => {
  // KSEC-007 — the author, a reviewer of it, or teaching/exam staff.
  const sub = await prisma.submission.findUnique({ where: { id: req.params.submissionId }, select: { studentUserId: true, peerReviews: { select: { reviewerUserId: true } } } });
  const u = req.user!;
  if (!sub || (sub.studentUserId !== u.id && !sub.peerReviews.some((r) => r.reviewerUserId === u.id) && !PEER_REVIEW_STAFF.has(u.role))) return res.status(404).json({ message: "Submission not found.", code: "NOT_FOUND" });
  const reviews = await prisma.peerReview.findMany({
    where: { submissionId: req.params.submissionId },
    orderBy: { createdAt: "desc" },
  });
  res.json(reviews);
});
