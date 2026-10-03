import { Router } from "express";
import { z } from "zod";
import { requireAuth, AuthedRequest } from "../middleware/auth.js";
import { hasPermission } from "../lib/permissions.js";
import { callAiModel } from "../lib/ai-gateway.js";
import { findRelevantTopics } from "../lib/curriculum.js";
import { prisma } from "../lib/prisma.js";

// ---------------------------------------------------------------------------
// AI033 — AI viva.
//
// Every prior batch correctly deferred this because a real spoken-dialogue
// exam sounded like it needed a hosted speech model this project has no
// credentials for. What actually changed since then: AI034/AI035 (batch 62)
// proved the browser's own Web Speech API is a real, zero-credential way to
// turn speech into text and text back into speech. This route supplies the
// other real half — an examiner "brain" that asks grounded follow-up
// questions and keeps a persisted transcript — using the exact same
// text-only AI gateway every other assistant in this codebase already goes
// through. Nothing here is a stub: a student can genuinely have a spoken
// back-and-forth oral exam practice session today, with zero paid
// infrastructure, and — same principle as EX036's simulation lab and
// AI037's safety layer — the AI counterpart never scores its own
// conversation. A human (TRAINER/EXAMINATION_OFFICER/SUPER_ADMIN) always
// does that, after reviewing the real transcript.
// ---------------------------------------------------------------------------

export const vivaRouter = Router();

const turnSchema = z.object({
  unit: z.string().min(1),
  studentAnswer: z.string().optional(),
  sessionId: z.string().optional(),
  assessmentId: z.string().optional(),
  // Whether this turn's studentAnswer actually came from the Web Speech
  // API (true) or a typed fallback (false/omitted) — recorded honestly on
  // the turn rather than assumed, so a reviewer can see which parts of a
  // "viva" were genuinely spoken.
  spokenInput: z.boolean().optional(),
});

const EXAMINER_SYSTEM = (unit: string, context: string) =>
  `You are an oral examiner conducting a viva voce for the unit "${unit}". ` +
  `Ask one focused follow-up question at a time based on the student's most recent answer, ` +
  `probing for real understanding rather than rote recall. Keep each question to 1-2 sentences ` +
  `so it reads naturally aloud. Stay strictly within this unit's real syllabus content below — ` +
  `never invent facts about the student's course. Do not grade or comment on correctness; ` +
  `a human examiner reviews the transcript afterwards and assigns the actual score.\n\n` +
  `Unit syllabus reference:\n${context}`;

vivaRouter.post("/turn", requireAuth, async (req: AuthedRequest, res) => {
  if (!(await hasPermission(req.user!.role, "AI", "USE_TUTOR"))) {
    return res.status(403).json({ message: "The AI viva is disabled for your role." });
  }
  const parsed = turnSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Provide a unit and, after the first turn, your answer." });

  const student = await prisma.student.findUnique({ where: { userId: req.user!.id } });
  if (!student) return res.status(404).json({ message: "No student record for this account." });

  let sessionId = parsed.data.sessionId;
  if (!sessionId) {
    const session = await prisma.aiVivaSession.create({
      data: { studentId: student.id, unit: parsed.data.unit, assessmentId: parsed.data.assessmentId ?? null },
    });
    sessionId = session.id;
  } else {
    const existing = await prisma.aiVivaSession.findUnique({ where: { id: sessionId } });
    if (!existing || existing.studentId !== student.id) {
      return res.status(404).json({ message: "Viva session not found." });
    }
    if (existing.endedAt) return res.status(400).json({ message: "This session has already ended." });
  }

  const topics = findRelevantTopics(parsed.data.unit, "");
  const context = topics.map((t) => `${t.title}: ${t.summary}`).join("\n") || "No specific topics on file for this unit.";

  if (!parsed.data.studentAnswer) {
    const opening = `Let's begin. First question: can you explain, in your own words, one key concept from ${parsed.data.unit} and why it matters in practice?`;
    await prisma.aiVivaTurn.create({ data: { sessionId, role: "examiner", content: opening, spokenInput: false } });
    return res.json({ reply: opening, sessionId });
  }

  await prisma.aiVivaTurn.create({
    data: { sessionId, role: "student", content: parsed.data.studentAnswer, spokenInput: Boolean(parsed.data.spokenInput) },
  });

  const priorTurns = await prisma.aiVivaTurn.findMany({ where: { sessionId }, orderBy: { createdAt: "asc" } });

  const result = await callAiModel({
    feature: "tutor",
    userId: req.user!.id,
    role: req.user!.role,
    maxTokens: 250,
    system: EXAMINER_SYSTEM(parsed.data.unit, context),
    messages: priorTurns.map((t) => ({ role: t.role === "student" ? "user" : "assistant", content: t.content })),
    screenInput: parsed.data.studentAnswer,
  });

  const reply = result.ok
    ? result.text
    : result.reason === "no_api_key"
    ? "[DRAFT — set ANTHROPIC_API_KEY for a live AI examiner] Thank you. Can you say more about how that applies in a real workplace situation?"
    : result.message;

  await prisma.aiVivaTurn.create({ data: { sessionId, role: "examiner", content: reply, spokenInput: false } });

  res.json({ reply, sessionId });
});

vivaRouter.patch("/sessions/:id/end", requireAuth, async (req: AuthedRequest, res) => {
  const student = await prisma.student.findUnique({ where: { userId: req.user!.id } });
  if (!student) return res.status(404).json({ message: "No student record for this account." });
  const session = await prisma.aiVivaSession.findUnique({ where: { id: req.params.id } });
  if (!session || session.studentId !== student.id) return res.status(404).json({ message: "Session not found." });
  const updated = await prisma.aiVivaSession.update({ where: { id: session.id }, data: { endedAt: new Date() } });
  res.json(updated);
});

vivaRouter.get("/sessions/mine", requireAuth, async (req: AuthedRequest, res) => {
  const student = await prisma.student.findUnique({ where: { userId: req.user!.id } });
  if (!student) return res.status(404).json({ message: "No student record for this account." });
  const sessions = await prisma.aiVivaSession.findMany({
    where: { studentId: student.id },
    orderBy: { startedAt: "desc" },
    select: { id: true, unit: true, assessmentId: true, startedAt: true, endedAt: true, score: true, feedback: true },
  });
  res.json(sessions);
});

vivaRouter.get("/sessions/:id", requireAuth, async (req: AuthedRequest, res) => {
  const session = await prisma.aiVivaSession.findUnique({
    where: { id: req.params.id },
    include: { turns: { orderBy: { createdAt: "asc" } }, student: { select: { fullName: true, userId: true } } },
  });
  if (!session) return res.status(404).json({ message: "Session not found." });
  const isOwner = session.student.userId === req.user!.id;
  const isStaff = ["TRAINER", "EXAMINATION_OFFICER", "SUPER_ADMIN"].includes(req.user!.role);
  if (!isOwner && !isStaff) return res.status(403).json({ message: "Not permitted." });
  res.json(session);
});

// Staff review queue — ended-but-unscored sessions.
vivaRouter.get("/sessions", requireAuth, async (req: AuthedRequest, res) => {
  if (!["TRAINER", "EXAMINATION_OFFICER", "SUPER_ADMIN"].includes(req.user!.role)) {
    return res.status(403).json({ message: "Not permitted." });
  }
  const onlyUnscored = req.query.unscored === "true";
  const sessions = await prisma.aiVivaSession.findMany({
    where: { endedAt: { not: null }, ...(onlyUnscored ? { score: null } : {}) },
    orderBy: { endedAt: "desc" },
    include: { student: { select: { fullName: true } } },
    take: 100,
  });
  res.json(sessions);
});

// Human-confirmed score — the AI examiner never assigns this itself.
const scoreSchema = z.object({ score: z.number().min(0).max(100), feedback: z.string().optional() });
vivaRouter.patch("/sessions/:id/score", requireAuth, async (req: AuthedRequest, res) => {
  if (!["TRAINER", "EXAMINATION_OFFICER", "SUPER_ADMIN"].includes(req.user!.role)) {
    return res.status(403).json({ message: "Not permitted." });
  }
  const parsed = scoreSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Score must be 0-100." });
  const session = await prisma.aiVivaSession.findUnique({ where: { id: req.params.id } });
  if (!session) return res.status(404).json({ message: "Session not found." });
  if (!session.endedAt) return res.status(400).json({ message: "Can't score a session that hasn't ended yet." });

  const updated = await prisma.aiVivaSession.update({
    where: { id: session.id },
    data: { score: parsed.data.score, feedback: parsed.data.feedback, scoredById: req.user!.id, scoredAt: new Date() },
  });
  res.json(updated);
});
