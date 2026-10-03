import { Router } from "express";
import { z } from "zod";
import { requireAuth, AuthedRequest } from "../middleware/auth.js";
import { hasPermission } from "../lib/permissions.js";
import { callAiModel } from "../lib/ai-gateway.js";
import { prisma } from "../lib/prisma.js";

export const simulationRouter = Router();

const scenarios: Record<string, { persona: string; opening: string }> = {
  virtual_shop_customer: {
    persona:
      "You are a walk-in customer at the student's small retail shop. You have a specific need and a modest budget. Stay in character; don't break out to give the student advice.",
    opening: "Hi, I'm looking for something for my daughter's birthday — what would you recommend around KES 1,000?",
  },
  investor_pitch: {
    persona:
      "You are a cautious local investor listening to the student's business pitch. Ask pointed but fair questions about their numbers and assumptions. Stay in character.",
    opening: "Alright, I'm listening — walk me through your business idea and why it'll make money.",
  },
  supplier_negotiation: {
    persona:
      "You are a supplier negotiating a bulk order with the student. You have your own margins to protect but are willing to negotiate reasonably. Stay in character.",
    opening: "I can do the order, but at your proposed price I'm barely covering costs. What can you offer instead?",
  },
  difficult_customer_service: {
    persona:
      "You are a frustrated customer whose order arrived late. You want a resolution and want to feel heard. Stay in character, don't be gratuitously rude.",
    opening: "This is the second time my order has been late and nobody told me why. What are you going to do about it?",
  },
};

export type ScenarioKey = keyof typeof scenarios;

const turnSchema = z.object({
  scenario: z.enum([
    "virtual_shop_customer",
    "investor_pitch",
    "supplier_negotiation",
    "difficult_customer_service",
  ]),
  studentMessage: z.string().optional(),
  // EX036 — carries the session across turns so the whole conversation can
  // be persisted and, later, reviewed and scored by a trainer. Omitted on
  // the very first call of a scenario, which is when the session is created.
  sessionId: z.string().optional(),
});

simulationRouter.post("/turn", requireAuth, async (req: AuthedRequest, res) => {
  // AI005
  if (!(await hasPermission(req.user!.role, "AI", "SIMULATION"))) {
    return res.status(403).json({ message: "The AI business simulation is disabled for your role." });
  }
  const parsed = turnSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Choose a valid scenario." });

  const scenario = scenarios[parsed.data.scenario];

  // EX036 — Business simulation lab persistence. Previously every /turn
  // call was a stateless one-shot AI reply with nothing kept afterwards —
  // no session, no transcript, and no way for a trainer to ever see what a
  // student actually did in the lab, let alone score it. Now the first
  // call in a scenario creates a real SimulationSession, and every
  // student message + AI reply after that is appended to it as
  // SimulationTurn rows.
  let sessionId = parsed.data.sessionId;
  if (!sessionId) {
    const session = await prisma.simulationSession.create({
      data: { studentId: req.user!.id, scenario: parsed.data.scenario },
    });
    sessionId = session.id;
  } else {
    const existing = await prisma.simulationSession.findUnique({ where: { id: sessionId } });
    if (!existing || existing.studentId !== req.user!.id) {
      return res.status(404).json({ message: "Simulation session not found." });
    }
    if (existing.endedAt) return res.status(400).json({ message: "This session has already ended." });
  }

  if (!parsed.data.studentMessage) {
    await prisma.simulationTurn.create({ data: { simulationSessionId: sessionId, role: "partner", content: scenario.opening } });
    return res.json({ reply: scenario.opening, sessionId });
  }

  await prisma.simulationTurn.create({ data: { simulationSessionId: sessionId, role: "student", content: parsed.data.studentMessage } });

  const priorTurns = await prisma.simulationTurn.findMany({ where: { simulationSessionId: sessionId }, orderBy: { createdAt: "asc" } });

  const result = await callAiModel({
    feature: "simulation",
    userId: req.user!.id,
    role: req.user!.role,
    maxTokens: 300,
    system: scenario.persona,
    messages: priorTurns.map((t) => ({ role: t.role === "student" ? "user" : "assistant", content: t.content })),
    screenInput: parsed.data.studentMessage,
  });

  const reply = result.ok
    ? result.text
    : result.reason === "no_api_key"
    ? "[DRAFT — set ANTHROPIC_API_KEY for a live simulation partner] I hear you. What's your next offer?"
    : result.message;

  await prisma.simulationTurn.create({ data: { simulationSessionId: sessionId, role: "partner", content: reply } });

  res.json({ reply, sessionId });
});

// EX036 — end the session so it stops accepting turns and becomes
// available for a trainer to review and score.
simulationRouter.patch("/sessions/:id/end", requireAuth, async (req: AuthedRequest, res) => {
  const session = await prisma.simulationSession.findUnique({ where: { id: req.params.id } });
  if (!session || session.studentId !== req.user!.id) return res.status(404).json({ message: "Session not found." });
  const updated = await prisma.simulationSession.update({ where: { id: session.id }, data: { endedAt: new Date() } });
  res.json(updated);
});

// EX036 — a student's own past sessions.
simulationRouter.get("/sessions/mine", requireAuth, async (req: AuthedRequest, res) => {
  const sessions = await prisma.simulationSession.findMany({
    where: { studentId: req.user!.id },
    orderBy: { startedAt: "desc" },
    select: { id: true, scenario: true, startedAt: true, endedAt: true, score: true, feedback: true },
  });
  res.json(sessions);
});

// EX036 — full transcript for one session (the student who ran it, or
// trainer-side staff reviewing it).
simulationRouter.get("/sessions/:id", requireAuth, async (req: AuthedRequest, res) => {
  const session = await prisma.simulationSession.findUnique({
    where: { id: req.params.id },
    include: { turns: { orderBy: { createdAt: "asc" } }, student: { select: { id: true, email: true, student: { select: { fullName: true, studentNumber: true } } } } },
  });
  if (!session) return res.status(404).json({ message: "Session not found." });
  const isOwner = session.studentId === req.user!.id;
  const isStaff = ["TRAINER", "EXAMINATION_OFFICER", "SUPER_ADMIN"].includes(req.user!.role);
  if (!isOwner && !isStaff) return res.status(403).json({ message: "Not permitted." });
  res.json({ ...session, student: { ...session.student, fullName: session.student.student?.fullName ?? session.student.email } });
});

// EX036 — trainer review queue: ended-but-unscored sessions across every
// student, so a trainer has somewhere to actually go do the scoring this
// feature was missing entirely before.
simulationRouter.get("/sessions", requireAuth, async (req: AuthedRequest, res) => {
  if (!["TRAINER", "EXAMINATION_OFFICER", "SUPER_ADMIN"].includes(req.user!.role)) {
    return res.status(403).json({ message: "Not permitted." });
  }
  const onlyUnscored = req.query.unscored === "true";
  const sessions = await prisma.simulationSession.findMany({
    where: { endedAt: { not: null }, ...(onlyUnscored ? { score: null } : {}) },
    orderBy: { endedAt: "desc" },
    include: { student: { select: { id: true, email: true, student: { select: { fullName: true, studentNumber: true } } } } },
    take: 100,
  });
  res.json(sessions.map((session) => ({ ...session, student: { ...session.student, fullName: session.student.student?.fullName ?? session.student.email } })));
});

// EX036 — trainer-confirmed score. Deliberately a separate, human step: the
// same principle behind AI037's safety layer and AI033's human-conducted
// viva — the AI counterpart is a practice partner, not the assessor of its
// own conversation.
const scoreSchema = z.object({ score: z.number().min(0).max(100), feedback: z.string().optional() });
simulationRouter.patch("/sessions/:id/score", requireAuth, async (req: AuthedRequest, res) => {
  if (!["TRAINER", "EXAMINATION_OFFICER", "SUPER_ADMIN"].includes(req.user!.role)) {
    return res.status(403).json({ message: "Not permitted." });
  }
  const parsed = scoreSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Score must be 0-100." });
  const session = await prisma.simulationSession.findUnique({ where: { id: req.params.id } });
  if (!session) return res.status(404).json({ message: "Session not found." });
  if (!session.endedAt) return res.status(400).json({ message: "Can't score a session that hasn't ended yet." });

  const updated = await prisma.simulationSession.update({
    where: { id: session.id },
    data: { score: parsed.data.score, feedback: parsed.data.feedback, scoredById: req.user!.id, scoredAt: new Date() },
  });
  res.json(updated);
});
