import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth, AuthedRequest } from "../middleware/auth.js";
import { courseGate } from "../lib/course-access.js";

export const forumsRouter = Router();

forumsRouter.get("/course/:courseId", requireAuth, async (req: AuthedRequest, res) => {
  if (!(await courseGate(req, res, req.params.courseId))) return;
  const forums = await prisma.forum.findMany({
    where: { courseId: req.params.courseId },
    include: { posts: { orderBy: { createdAt: "asc" } } },
  });
  res.json(forums);
});

const forumSchema = z.object({ courseId: z.string(), title: z.string().min(2) });

forumsRouter.post("/", requireAuth, async (req: AuthedRequest, res) => {
  const parsed = forumSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid forum." });
  const forum = await prisma.forum.create({ data: parsed.data });
  res.status(201).json(forum);
});

const postSchema = z.object({ forumId: z.string(), body: z.string().min(1), parentId: z.string().optional() });

forumsRouter.post("/posts", requireAuth, async (req: AuthedRequest, res) => {
  const parsed = postSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Write something to post." });
  const post = await prisma.forumPost.create({
    data: { ...parsed.data, authorId: req.user!.id },
  });
  // Batch 77 — COM009: tell everyone subscribed to this forum (except the author), at most one notice per forum per hour each.
  void (async () => {
    const subs = await prisma.forumSubscription.findMany({ where: { forumId: parsed.data.forumId, userId: { not: req.user!.id } }, select: { userId: true } });
    if (!subs.length) return;
    const forum = await prisma.forum.findUnique({ where: { id: parsed.data.forumId }, select: { title: true } });
    const { notifyOnce } = await import("../lib/reminder-jobs.js");
    await notifyOnce(subs.map((x) => ({ userId: x.userId, title: `New post in ${forum?.title ?? "forum"}`.slice(0, 120), body: parsed.data.body.slice(0, 160) })), "announcement", 0.04);
  })().catch(() => undefined);
  res.status(201).json(post);
});
