import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth, AuthedRequest } from "../middleware/auth.js";
import { hasPermission } from "../lib/permissions.js";
import { callAiModel } from "../lib/ai-gateway.js";

export const careerRouter = Router();

// A small, honest job-role mapping table — not invented per request, fixed
// per programme so the AI career adviser can't hallucinate wildly different
// outcomes each time it's asked.
const roleMap: Record<string, string[]> = {
  "diploma-business-management": [
    "Business Development Associate",
    "Operations Assistant",
    "SME Owner/Manager",
  ],
  "certificate-digital-marketing": [
    "Social Media Coordinator",
    "Digital Marketing Assistant",
    "Freelance Digital Marketer",
  ],
  "diploma-accounting-finance": [
    "Accounts Assistant",
    "Bookkeeper",
    "Junior Auditor",
  ],
  "certificate-office-digital-skills": [
    "Office Administrator",
    "Data Entry Clerk",
    "Customer Service Assistant",
  ],
};

careerRouter.get("/roles/:programmeSlug", requireAuth, async (req, res) => {
  const roles = roleMap[req.params.programmeSlug];
  if (!roles) return res.status(404).json({ message: "No role mapping for that programme yet." });
  res.json({ roles });
});

// SP028 — the career advisor previously only worked if the frontend hardcoded
// a programme slug; a student in any other programme silently got Business
// Management's roles. This resolves the caller's *real* programme.
careerRouter.get("/my-roles", requireAuth, async (req: AuthedRequest, res) => {
  const student = await prisma.student.findUnique({
    where: { userId: req.user!.id },
    include: { programme: true },
  });
  if (!student) return res.status(404).json({ message: "No student record for this account." });

  const roles = roleMap[student.programme.slug];
  res.json({
    programme: student.programme.name,
    programmeSlug: student.programme.slug,
    roles: roles ?? [],
    hasMapping: Boolean(roles),
  });
});

const cvSchema = z.object({
  targetRole: z.string().min(2),
  experienceSummary: z.string().min(5),
  // AI036 — multilingual AI: previously only the tutor accepted a language
  // choice; a CV drafted for a Kenyan employer is one of the more
  // plausible places a student would actually want a Swahili draft, so
  // this is a real extension of the pattern, not a token gesture.
  language: z.enum(["en", "sw"]).default("en"),
});

// Drafts CV bullet points from what the student actually tells us —
// grounded in their own input, not invented achievements.
careerRouter.post("/cv-draft", requireAuth, async (req: AuthedRequest, res) => {
  // AI005 — was previously ungated by any fine-grained AI permission.
  if (!(await hasPermission(req.user!.role, "AI", "CV_DRAFT"))) {
    return res.status(403).json({ message: "AI CV drafting is disabled for your role." });
  }
  const parsed = cvSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Tell us the role and your experience." });
  const languageInstruction = parsed.data.language === "sw" ? " Write the bullet points in Swahili (Kiswahili)." : "";

  const result = await callAiModel({
    feature: "cv-draft",
    userId: req.user!.id,
    role: req.user!.role,
    maxTokens: 400,
    system:
      `Draft 3-4 CV bullet points for a Kenyan TVET graduate, based only on the experience they describe. Never invent achievements, numbers, or responsibilities they didn't mention.${languageInstruction}`,
    messages: [
      {
        role: "user",
        content: `Target role: ${parsed.data.targetRole}\nMy experience: ${parsed.data.experienceSummary}`,
      },
    ],
    screenInput: parsed.data.experienceSummary,
  });

  const draft = result.ok
    ? result.text
    : result.reason === "no_api_key"
    ? `[DRAFT — set ANTHROPIC_API_KEY for AI-assisted phrasing]\n\nBased on: ${parsed.data.experienceSummary}\nTarget role: ${parsed.data.targetRole}`
    : result.message;

  res.json({ draft });
});

// SP028 — separate save step (not baked into /cv-draft) so a student can
// generate several drafts before deciding which one is worth keeping.
const saveCvSchema = z.object({ targetRole: z.string().min(2), draft: z.string().min(5) });
careerRouter.post("/cv-draft/save", requireAuth, async (req: AuthedRequest, res) => {
  const parsed = saveCvSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Nothing to save." });

  const student = await prisma.student.findUnique({ where: { userId: req.user!.id } });
  if (!student) return res.status(404).json({ message: "No student record for this account." });

  const item = await prisma.portfolioItem.create({
    data: {
      studentId: student.id,
      title: `CV draft — ${parsed.data.targetRole}`,
      description: parsed.data.draft,
      category: "cv",
    },
  });
  res.status(201).json(item);
});

const interviewSchema = z.object({
  role: z.string().min(2),
  answer: z.string().optional(),
  turn: z.number().int().default(0),
  // SP028 — carried across turns so the whole mock interview is one real,
  // re-readable AiConversation instead of vanishing on refresh.
  conversationId: z.string().optional(),
});

// Simulated interview: the AI stays in character as an interviewer for the
// named role, one question per turn, and gives feedback on the student's
// last answer — never scores the student's employability, just practices.
careerRouter.post("/mock-interview", requireAuth, async (req: AuthedRequest, res) => {
  // AI005
  if (!(await hasPermission(req.user!.role, "AI", "MOCK_INTERVIEW"))) {
    return res.status(403).json({ message: "The AI mock interview is disabled for your role." });
  }
  const parsed = interviewSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Provide a target role." });

  let conversation = parsed.data.conversationId
    ? await prisma.aiConversation.findFirst({
        where: { id: parsed.data.conversationId, userId: req.user!.id },
        include: { messages: { orderBy: { createdAt: "asc" } } },
      })
    : null;
  if (!conversation) {
    conversation = await prisma.aiConversation.create({
      data: { userId: req.user!.id, context: `career-interview:${parsed.data.role}` },
      include: { messages: true },
    });
  }

  const priorTurns = conversation.messages.map((m) => ({
    role: (m.role === "assistant" ? "assistant" : "user") as "user" | "assistant",
    content: m.content,
  }));
  const turnMessage = parsed.data.answer
    ? `My answer to your last question: ${parsed.data.answer}`
    : "Let's begin the interview.";

  const result = await callAiModel({
    feature: "mock-interview",
    userId: req.user!.id,
    role: req.user!.role,
    maxTokens: 300,
    system: `You are a friendly interview panelist for a ${parsed.data.role} role at a Kenyan SME. Ask one interview question at a time. If the candidate just answered a previous question, briefly acknowledge it and give one specific, constructive tip before asking the next question.`,
    messages: [...priorTurns, { role: "user", content: turnMessage }],
    screenInput: parsed.data.answer,
  });

  const reply = result.ok
    ? result.text
    : result.reason === "no_api_key"
    ? `[DRAFT — set ANTHROPIC_API_KEY for a real mock interview]\n\nSample question for a ${parsed.data.role}: "Tell me about a time you had to learn something new quickly."`
    : result.message;

  await prisma.aiMessage.createMany({
    data: [
      {
        conversationId: conversation.id,
        role: "user",
        content: parsed.data.answer ? `My answer: ${parsed.data.answer}` : "Let's begin the interview.",
        sourceRefs: [],
      },
      { conversationId: conversation.id, role: "assistant", content: reply, sourceRefs: [] },
    ],
  });

  res.json({ reply, conversationId: conversation.id });
});
