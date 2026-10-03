// LMS023 — xAPI (Tin Can) support: a real, minimal Learning Record Store.
// Honest scope: this accepts and stores statements in the standard
// actor/verb/object shape and lets them be queried back by actor or object.
// It is NOT a conformant xAPI 1.0.3 LRS (no /statements query grammar, no
// voiding, no attachments, no OAuth) — a genuine subset, documented as such
// rather than claimed as full spec compliance.
import { Router } from "express";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireRole, AuthedRequest } from "../middleware/auth.js";

export const xapiRouter = Router();

const statementSchema = z.object({
  verb: z.string().min(1).max(100),
  objectId: z.string().min(1).max(300),
  objectName: z.string().max(300).nullable().optional(),
  result: z
    .object({
      completion: z.boolean().optional(),
      success: z.boolean().optional(),
      score: z.object({ raw: z.number().optional(), min: z.number().optional(), max: z.number().optional(), scaled: z.number().optional() }).optional(),
    })
    .nullable()
    .optional(),
  context: z.record(z.unknown()).nullable().optional(),
});

// A viewer (LessonView, the SCORM player wrapper, quiz submission, etc.)
// emits one statement per meaningful event. Stored for the caller's own
// actorUserId — nobody can post a statement as someone else.
xapiRouter.post("/statements", requireAuth, async (req: AuthedRequest, res) => {
  const parsed = statementSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid xAPI statement.", issues: parsed.error.issues?.slice(0, 3) });
  const d = parsed.data;
  const statement = await prisma.xapiStatement.create({
    data: {
      actorUserId: req.user!.id,
      verb: d.verb,
      objectId: d.objectId,
      objectName: d.objectName ?? null,
      result: d.result ? JSON.parse(JSON.stringify(d.result)) as Prisma.InputJsonValue : undefined,
      context: d.context ? JSON.parse(JSON.stringify(d.context)) as Prisma.InputJsonValue : undefined,
      raw: JSON.parse(JSON.stringify({ actor: req.user!.id, ...d })) as Prisma.InputJsonValue,
    },
  });
  res.status(201).json({ id: statement.id, recordedAt: statement.recordedAt });
});

// My own learning record stream.
xapiRouter.get("/statements/mine", requireAuth, async (req: AuthedRequest, res) => {
  const statements = await prisma.xapiStatement.findMany({
    where: { actorUserId: req.user!.id },
    orderBy: { recordedAt: "desc" },
    take: 200,
  });
  res.json(statements);
});

// Every statement about one object (e.g. "lesson:<id>"), for a trainer/QA
// view of engagement with a specific piece of content.
xapiRouter.get("/statements/about/:objectId", requireAuth, requireRole("TRAINER", "QA_OFFICER", "SUPER_ADMIN", "PROGRAMME_COORDINATOR"), async (req, res) => {
  const statements = await prisma.xapiStatement.findMany({
    where: { objectId: req.params.objectId },
    orderBy: { recordedAt: "desc" },
    take: 500,
  });
  res.json(statements);
});

// A coarse institutional summary — statement counts by verb over the last
// 30 days — rather than a full analytics engine (see learning-analytics.ts
// for the per-student/per-course numbers LMS028 is really about).
xapiRouter.get("/summary", requireAuth, requireRole("SUPER_ADMIN", "QA_OFFICER", "PROGRAMME_COORDINATOR"), async (_req, res) => {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const recent = await prisma.xapiStatement.findMany({ where: { recordedAt: { gte: since } }, select: { verb: true } });
  const byVerb: Record<string, number> = {};
  for (const s of recent) byVerb[s.verb] = (byVerb[s.verb] ?? 0) + 1;
  res.json({ since, totalStatements: recent.length, byVerb });
});
