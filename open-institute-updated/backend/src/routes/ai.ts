import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireRole, AuthedRequest } from "../middleware/auth.js";
import { canTeachCourse } from "../lib/course-access.js";
import { findRelevantTopics } from "../lib/curriculum.js";
import { getKnowledgeBaseTopics } from "../lib/curriculum.js";
import { federatedLibrarySearch } from "../lib/repositories/federated.js";
import { computeTrialBalance } from "../lib/ledger.js";
import { hasPermission } from "../lib/permissions.js";
import { questionSchema } from "./exams.js";
import { callAiModel, AI_FEATURE_CATALOG, getAiUsageStats, getRecentSafetyBlocks, getActiveModelConfig, setActiveModelConfig } from "../lib/ai-gateway.js";
import { suggestDifficulty } from "../lib/weakness-detection.js";
import { searchIngestedTopics } from "../lib/document-ingestion.js";

export const aiRouter = Router();

const tutorSchema = z.object({
  unit: z.string(),
  message: z.string().min(1).max(2000),
  difficulty: z.enum(["beginner", "intermediate", "advanced"]).default("intermediate"),
  // SP024 — when provided, the exchange is persisted into this TutorSession
  // (TutorMessage rows) instead of only the AiConversation audit log, and
  // recent turns from the same session are given to the model as real
  // conversational context — this is what makes the tutor "persistent and
  // personalized across sessions" rather than a one-shot Q&A each time.
  sessionId: z.string().optional(),
  // AI036 — multilingual AI. This is a real, working instruction to the
  // model to answer in the chosen language, not a translation layer with
  // any verification behind it — there's no separate check that the
  // model's Swahili is correct, only that it was asked for. Left at 🟡 in
  // the audit for that reason. English stays the default so nothing about
  // the existing behaviour changes for a caller that doesn't set this.
  language: z.enum(["en", "sw"]).default("en"),
});

const trainerAssistSchema = z.object({
  // TP018 — "feedback" used to be a generic, unit-level draft here with no
  // submission behind it and nowhere to apply the result. That's now the
  // submission-scoped /marking-assistant + AiFeedbackSession flow further
  // down this file (grounded in a REAL submission's real text, with a real
  // accept/apply step into Submission.feedback) — TrainerGradebook.tsx
  // links there instead of duplicating a second, disconnected mechanism.
  action: z.enum(["quiz", "lesson-plan", "summary", "case-study"]),
  unit: z.string(),
});

const actionPrompts: Record<string, string> = {
  quiz: "Draft a 5-question formative quiz on this unit's most recent topic, with an answer key.",
  "lesson-plan": "Draft a 40-minute lesson plan covering this unit's next topic, with a warm-up, core activity, and check for understanding.",
  summary: "Summarise likely class performance patterns a trainer should watch for in this unit, in 4-5 sentences.",
  // AI031 — case-study generation: was previously "not built distinctly" —
  // it now reuses the same curriculum-grounded trainer-assist pipeline as
  // the other four draft actions (identical grounding, fallback, and
  // human-review discipline) rather than a one-off endpoint, matching the
  // codebase's own precedent for extending a shared mechanism (e.g. QA008's
  // category field) instead of duplicating it.
  "case-study": "Draft a realistic workplace case study scenario grounded in this unit's most recent topic, ending in 2-3 open discussion questions for students to analyse.",
};

// Trainer-facing AI drafting. Same curriculum-grounding discipline as the
// student tutor: draws only from approved unit topics, never auto-publishes.
aiRouter.post("/trainer-assist", requireAuth, async (req: AuthedRequest, res) => {
  // AI005 — fine-grained AI permission: SUPER_ADMIN can revoke a role's
  // access to a specific AI feature via RolePermission without touching
  // requireRole/code (see routes/role-permissions.ts).
  if (!(await hasPermission(req.user!.role, "AI", "TRAINER_ASSIST"))) {
    return res.status(403).json({ message: "AI trainer assistance is disabled for your role." });
  }
  const parsed = trainerAssistSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Choose a valid action and unit." });

  const { action, unit } = parsed.data;
  const topics = findRelevantTopics(unit, "");
  const context = topics.map((t) => `${t.title}: ${t.summary}`).join("\n");

  const result = await callAiModel({
    feature: "trainer-assist",
    userId: req.user!.id,
    role: req.user!.role,
    maxTokens: 600,
    system:
      "You help a TVET business trainer draft teaching materials, grounded only in the approved unit material below. Mark this clearly as a draft for the trainer's review.\n\nApproved material:\n" +
      context,
    messages: [{ role: "user", content: actionPrompts[action] }],
  });

  const draft = result.ok
    ? result.text
    : result.reason === "no_api_key"
    ? `[DRAFT — set ANTHROPIC_API_KEY to generate real content]\n\n${actionPrompts[action]}\n\nBased on: ${context}`
    : result.message;

  res.json({ draft });
});

// The AI tutor is deliberately narrow: it only answers from `curriculum.ts`
// topics for the named unit. If ANTHROPIC_API_KEY is set, it uses the model
// to phrase an answer grounded strictly in those topics; otherwise it
// returns the topic summaries directly so the feature still works end to end
// without a paid API key. Either path always returns sourceRefs and logs the
// exchange for QA/audit — this endpoint never fabricates a citation.
// AI024 — adaptive learning: suggests where to default the tutor's
// difficulty selector, from this student's own recent graded assessment
// scores (see lib/weakness-detection.ts's suggestDifficulty). Previously
// the selector always defaulted to "intermediate" for every student
// regardless of how they were actually doing — a manual control with no
// data behind its starting position. This is still just a suggestion: the
// student can always change it, and AiTutor.tsx only applies it once, the
// first time a session loads, never overriding a choice the student made.
aiRouter.get("/suggested-difficulty", requireAuth, async (req: AuthedRequest, res) => {
  const recent = await prisma.submission.findMany({
    where: { studentUserId: req.user!.id, score: { not: null } },
    orderBy: { submittedAt: "desc" },
    take: 10,
    select: { score: true, assessment: { select: { totalMarks: true } } },
  });
  const percentages = recent
    .filter((s) => s.assessment && s.assessment.totalMarks > 0)
    .map((s) => (Number(s.score) / s.assessment!.totalMarks) * 100);
  res.json({ difficulty: suggestDifficulty(percentages), basedOnAttempts: percentages.length });
});

aiRouter.post("/tutor", requireAuth, async (req: AuthedRequest, res) => {
  if (!(await hasPermission(req.user!.role, "AI", "USE_TUTOR"))) {
    return res.status(403).json({ message: "The AI tutor is disabled for your role." });
  }
  const parsed = tutorSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Ask a question about your unit." });
  }
  const { unit, message, difficulty, sessionId, language } = parsed.data;
  const languageInstruction =
    language === "sw" ? " Respond in Swahili (Kiswahili), even though the material below is in English." : "";

  // SP024 — verify the session belongs to this student and pull its
  // recent turns for real multi-turn context. A bad/foreign sessionId is
  // treated as "no session" rather than erroring the whole request — the
  // tutor still answers, it just won't have persisted history for it.
  let session: { id: string; messages: { role: string; content: string }[] } | null = null;
  if (sessionId) {
    const found = await prisma.tutorSession.findFirst({
      where: { id: sessionId, studentId: req.user!.id },
      include: { messages: { orderBy: { timestamp: "desc" }, take: 8 } },
    });
    if (found) session = { id: found.id, messages: found.messages.reverse() };
  }

  async function persist(reply: string) {
    if (!session) return;
    await prisma.tutorMessage.createMany({
      data: [
        { sessionId: session.id, role: "student", content: message },
        { sessionId: session.id, role: "tutor", content: reply },
      ],
    });
    await prisma.tutorSession.update({
      where: { id: session.id },
      data: { unit, difficulty, messagesCount: { increment: 2 }, lastMessageAt: new Date() },
    });
  }

  // AI006 — prefer the managed, QA-approved knowledge base; only fall back
  // to the static curriculum.ts array when a unit has no approved entries.
  const dbTopics = await getKnowledgeBaseTopics(unit, message);
  let topics = dbTopics.length > 0 ? dbTopics : findRelevantTopics(unit, message);

  // AI007/AI008–012 (Batch 63) — before falling all the way back to library
  // catalogue metadata, try real retrieval over any documents a trainer has
  // actually ingested for this unit (lib/document-ingestion.ts:
  // searchIngestedTopics — cosine similarity over real extracted passages,
  // not just titles). Same honest scope as the rest of this route: no
  // ingested sources, or the search itself erroring, falls through to the
  // library step below exactly as if this stage didn't exist — it never
  // blocks the reply.
  if (topics.length === 0) {
    topics = await searchIngestedTopics(unit, message);
  }

  // No curriculum/knowledge-base/ingested-document match — fall back to
  // the library (internal catalogue + any configured DSpace/EPrints/
  // Islandora/Greenstone repository) before giving up. This is real
  // retrieval, not a fabricated citation: if the library also has
  // nothing, the tutor says so plainly.
  let libraryFallback: { title: string; url?: string }[] = [];
  if (topics.length === 0) {
    try {
      const { results } = await federatedLibrarySearch(message);
      libraryFallback = results.slice(0, 3).map((r) => ({ title: r.title, url: r.url }));
    } catch {
      libraryFallback = [];
    }

    if (libraryFallback.length === 0) {
      const noAnswerReply =
        "I don't have approved course material or library resources on that yet. I'll flag this to your trainer so it can be added, and I don't want to guess at an answer.";
      await persist(noAnswerReply);
      return res.json({ reply: noAnswerReply, sourceRefs: [] });
    }
  }

  let reply: string;
  const difficultyInstruction = {
    beginner: "Explain in the simplest possible terms, avoiding jargon, with a concrete everyday example.",
    intermediate: "Explain at a normal course level, assuming the basics are known.",
    advanced: "Give a more technical, detailed explanation and mention edge cases or common pitfalls.",
  }[difficulty];

  if (topics.length > 0) {
    const context = topics.map((t) => `${t.title}: ${t.summary}`).join("\n");
    // SP024 — real prior turns from this TutorSession, so a follow-up
    // question ("what about the second one?") actually has something to
    // refer back to instead of being answered cold every time.
    const history = session
      ? session.messages.map((m) => ({ role: (m.role === "student" ? "user" : "assistant") as "user" | "assistant", content: m.content }))
      : [];
    const result = await callAiModel({
      feature: "tutor",
      userId: req.user!.id,
      role: req.user!.role,
      maxTokens: 500,
      system:
        `You are a patient TVET business-college tutor. Answer ONLY using the approved material provided below. ${difficultyInstruction}${languageInstruction} Use a Kenyan business example where natural. If the material doesn't cover the student's question, say so plainly and do not add outside information.\n\nApproved material:\n` +
        context,
      messages: [...history, { role: "user", content: message }],
      screenInput: message,
    });

    if (result.ok) {
      reply = result.text;
    } else if (result.reason === "blocked_by_safety") {
      return res.status(400).json({ message: result.message });
    } else if (result.reason === "no_api_key") {
      // No model configured — serve the approved summaries directly.
      reply = topics.map((t) => `${t.title}: ${t.summary}`).join("\n\n");
    } else {
      reply = topics.map((t) => t.summary).join(" ");
    }
  } else {
    // Library fallback path — point the student at real resources rather
    // than answering from the model's general knowledge.
    reply =
      "I don't have this in your course material yet, but the library has related resources:\n\n" +
      libraryFallback.map((r) => `- ${r.title}${r.url ? ` (${r.url})` : ""}`).join("\n");
  }

  const sourceRefs =
    topics.length > 0 ? topics.map((t) => t.sourceRef) : libraryFallback.map((r) => r.title);

  const conversation = await prisma.aiConversation.create({
    data: {
      userId: req.user!.id,
      context: `tutor:${unit}`,
      messages: {
        create: [
          { role: "user", content: message, sourceRefs: [] },
          { role: "assistant", content: reply, sourceRefs },
        ],
      },
    },
  });

  await persist(reply);

  const answer = await prisma.aiMessage.findFirst({ where: { conversationId: conversation.id, role: "assistant" }, orderBy: { createdAt: "desc" }, select: { id: true } }); // KAI-020: lets the UI rate this answer
  res.json({ reply, sourceRefs, conversationId: conversation.id, sessionId: session?.id, messageId: answer?.id });
});

// ---------------------------------------------------------------------------
// SP025/SP026/SP027 — AI study planner, revision assistant, and academic
// adviser. Same discipline as the tutor above: every fact fed to the model
// (or shown directly, if no ANTHROPIC_API_KEY is set) is pulled from the
// student's own real data — roadmap status, actual assignment/assessment
// due dates, and actual graded scores. The model is only ever asked to
// phrase or organize that real data, never to invent academic facts about
// the student. Every call is logged to AiConversation for audit, same as
// the tutor.
// ---------------------------------------------------------------------------

// AI001 — every fact-sheet-grounded assistant below (study planner through
// marking assistant) shares this one call shape (system + single user
// message + fallback string), so it stays a thin wrapper around the real
// gateway rather than its own separate call path. `feature` attributes the
// call correctly in AiUsageLog (AI004); `screenInput` is the real free text
// a caller typed, when there is one, so the safety layer (AI037) has
// something to check — routes that only send fixed/structured prompts
// (no user free text) omit it, matching callAiModel's own contract.
async function callClaude(
  feature: string,
  userId: string,
  role: string,
  system: string,
  userMessage: string,
  fallback: string,
  screenInput?: string
): Promise<string> {
  const result = await callAiModel({
    feature,
    userId,
    role,
    system,
    messages: [{ role: "user", content: userMessage }],
    maxTokens: 700,
    screenInput,
  });
  if (result.ok) return result.text;
  if (result.reason === "blocked_by_safety") return result.message;
  return fallback;
}

async function loadStudentContext(userId: string) {
  const student = await prisma.student.findUnique({
    where: { userId },
    include: {
      programme: { include: { units: { orderBy: [{ semester: "asc" }, { code: "asc" }] } } },
      enrollments: {
        where: { status: "in_progress" },
        include: { unit: { include: { courses: { include: { assignments: true, assessments: true } } } } },
      },
    },
  });
  return student;
}

aiRouter.post("/study-planner", requireAuth, async (req: AuthedRequest, res) => {
  // AI005 — same fine-grained override mechanism as the tutor/trainer-assist
  // above; this route previously had none, so SUPER_ADMIN could not disable
  // it per role without editing code.
  if (!(await hasPermission(req.user!.role, "AI", "STUDY_PLANNER"))) {
    return res.status(403).json({ message: "The AI study planner is disabled for your role." });
  }
  const student = await loadStudentContext(req.user!.id);
  if (!student) return res.status(404).json({ message: "No student record for this account." });

  const now = new Date();
  const upcoming = student.enrollments
    .flatMap((e) =>
      e.unit.courses.flatMap((c) => [
        ...c.assignments.map((a) => ({ unit: e.unit.title, title: a.title, dueAt: a.dueAt, kind: "assignment" })),
        ...c.assessments
          .filter((a) => a.scheduledAt)
          .map((a) => ({ unit: e.unit.title, title: a.title, dueAt: a.scheduledAt!, kind: "assessment" })),
      ])
    )
    .filter((item) => item.dueAt > now)
    .sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime());

  const factSheet = upcoming.length
    ? upcoming.map((i) => `- ${i.unit}: ${i.kind} "${i.title}" due ${i.dueAt.toLocaleDateString()}`).join("\n")
    : "No upcoming deadlines are on record.";

  const fallback = upcoming.length
    ? `Here's what's actually on your calendar, ordered by deadline:\n\n${factSheet}\n\nA reasonable approach: work backwards from the earliest deadline, giving yourself at least 2-3 sessions per item before it's due.`
    : "You have no upcoming assignment or assessment deadlines on record right now — a good time to review earlier roadmap units you haven't completed yet.";

  // AI036 — multilingual AI: previously only the tutor (/ai/tutor) accepted
  // a language choice; every other AI endpoint was English-only regardless
  // of the student's preference. Same mechanism as the tutor's
  // languageInstruction — an instruction to the model, not a separate
  // translation pass, so it still reasons over the real English deadline
  // data above and only the reply itself changes language.
  const language = req.body?.language === "sw" ? "sw" : "en";
  const languageInstruction = language === "sw" ? " Respond in Swahili (Kiswahili)." : "";

  const reply = await callClaude(
    "study-planner",
    req.user!.id,
    req.user!.role,
    `You help a TVET student build a realistic weekly study plan, using ONLY the real deadlines listed below. Do not invent any deadline, unit, or assessment not listed. If the list is empty, say so and suggest reviewing incomplete units instead.${languageInstruction}\n\nReal upcoming deadlines:\n` +
      factSheet,
    "Draft me a study plan for this week.",
    fallback
  );

  await prisma.aiConversation.create({
    data: {
      userId: req.user!.id,
      context: "study-planner",
      messages: { create: [{ role: "assistant", content: reply, sourceRefs: upcoming.map((i) => i.title) }] },
    },
  });

  res.json({ plan: reply, upcomingDeadlines: upcoming });
});

aiRouter.post("/revision-assistant", requireAuth, async (req: AuthedRequest, res) => {
  // AI005
  if (!(await hasPermission(req.user!.role, "AI", "REVISION_ASSISTANT"))) {
    return res.status(403).json({ message: "The AI revision assistant is disabled for your role." });
  }
  const student = await loadStudentContext(req.user!.id);
  if (!student) return res.status(404).json({ message: "No student record for this account." });

  const graded = await prisma.submission.findMany({
    where: { studentUserId: req.user!.id, score: { not: null }, assessment: { resultsPublished: true } },
    include: { assessment: { include: { course: { include: { unit: true } } } } },
    orderBy: { gradedAt: "desc" },
  });

  const weakAreas = graded
    .filter((s) => s.assessment && s.score! / s.assessment.totalMarks < 0.6)
    .map((s) => ({
      unit: s.assessment!.course.unit.title,
      assessment: s.assessment!.title,
      percentage: Math.round((s.score! / s.assessment!.totalMarks) * 100),
    }));

  const factSheet = weakAreas.length
    ? weakAreas.map((w) => `- ${w.unit}: "${w.assessment}" scored ${w.percentage}%`).join("\n")
    : "No published results below 60% are on record.";

  const fallback = weakAreas.length
    ? `Based on your actual published results, prioritize revision in this order:\n\n${factSheet}\n\nRevisit the unit material for each, then attempt the practice question bank if your trainer has approved one.`
    : "Nothing below 60% shows up in your published results — no specific weak area to prioritize right now.";

  const reply = await callClaude(
    "revision-assistant",
    req.user!.id,
    req.user!.role,
    "You help a TVET student prioritize revision, using ONLY the real weak scores listed below. Do not invent a weakness that isn't listed.\n\nReal below-60% results:\n" +
      factSheet,
    "What should I revise first?",
    fallback
  );

  await prisma.aiConversation.create({
    data: {
      userId: req.user!.id,
      context: "revision-assistant",
      messages: { create: [{ role: "assistant", content: reply, sourceRefs: weakAreas.map((w) => w.assessment) }] },
    },
  });

  res.json({ plan: reply, weakAreas });
});

aiRouter.post("/academic-advisor", requireAuth, async (req: AuthedRequest, res) => {
  if (!(await hasPermission(req.user!.role, "AI", "USE_ACADEMIC_ADVISOR"))) {
    return res.status(403).json({ message: "The AI academic advisor is disabled for your role." });
  }
  const parsed = tutorSchema.pick({ message: true }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Ask an academic-planning question." });

  const student = await loadStudentContext(req.user!.id);
  if (!student) return res.status(404).json({ message: "No student record for this account." });

  const requiredUnitCount = student.programme.units.length;
  const enrollmentsAll = await prisma.enrollment.findMany({ where: { studentId: student.id } });
  const completedUnits = enrollmentsAll.filter((e) => e.status === "completed").length;
  const failedUnits = enrollmentsAll.filter((e) => e.status === "failed").map((e) => e.unitId);
  const remainingUnits = student.programme.units.filter(
    (u) => !enrollmentsAll.some((e) => e.unitId === u.id && e.status === "completed")
  );

  const factSheet = `Programme: ${student.programme.name}\nUnits required: ${requiredUnitCount}\nUnits completed: ${completedUnits}\nFailed units: ${failedUnits.length}\nRemaining units: ${remainingUnits.map((u) => u.title).join(", ") || "none"}`;

  const fallback = `Here's where you actually stand:\n\n${factSheet}\n\nFor a specific question about eligibility or transfer, use the graduation-status and appeals pages, or speak with the registrar — this advisor doesn't have the authority to make an exception on your behalf.`;

  const reply = await callClaude(
    "academic-advisor",
    req.user!.id,
    req.user!.role,
    "You are an academic adviser for a TVET student, grounded ONLY in the real progression facts below. Do not invent a rule, deadline, or policy not stated here. If the student asks about something outside these facts, say you don't have that information and suggest the registrar.\n\nReal progression facts:\n" +
      factSheet,
    parsed.data.message,
    fallback,
    parsed.data.message
  );

  await prisma.aiConversation.create({
    data: {
      userId: req.user!.id,
      context: "academic-advisor",
      messages: {
        create: [
          { role: "user", content: parsed.data.message, sourceRefs: [] },
          { role: "assistant", content: reply, sourceRefs: [] },
        ],
      },
    },
  });

  res.json({ reply });
});

// RG040 — AI registrar assistant. Honest about its own limits: it is
// grounded in a fixed real fact sheet (institution-wide counts, pulled
// live from the database) rather than true natural-language-to-SQL query
// routing — that would need retrieval infrastructure this instance
// doesn't have. It answers questions about the fact sheet and refuses to
// guess at anything outside it.
aiRouter.post(
  "/registrar-assistant",
  requireAuth,
  requireRole("REGISTRAR", "SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    // AI005
    if (!(await hasPermission(req.user!.role, "AI", "REGISTRAR_ASSISTANT"))) {
      return res.status(403).json({ message: "The AI registrar assistant is disabled for your role." });
    }
    const parsed = tutorSchema.pick({ message: true }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Ask a registrar question." });

    const programmes = await prisma.programme.findMany({ include: { students: true } });
    const pendingAmendments = await prisma.resultsAmendmentRequest.count({ where: { status: "pending" } });
    const pendingAppeals = await prisma.appeal.count({ where: { status: { in: ["submitted", "under_review"] } } });
    const pendingEvidence = await prisma.competencyEvidence.count({ where: { status: "pending" } });

    const totalStudents = programmes.reduce((sum, p) => sum + p.students.length, 0);
    const byProgramme = programmes
      .map((p) => `${p.name}: ${p.students.length} students`)
      .join("\n");

    const factSheet = `Total students across all programmes: ${totalStudents}\nBy programme:\n${byProgramme}\nPending results amendment requests: ${pendingAmendments}\nPending appeals: ${pendingAppeals}\nPending competency evidence reviews: ${pendingEvidence}`;

    const fallback = `Here's the current registrar fact sheet:\n\n${factSheet}\n\nFor anything not listed here (a specific student's file, a historical trend), use the Registry Actions or Graduation pages directly.`;

    const reply = await callClaude(
      "registrar-assistant",
      req.user!.id,
      req.user!.role,
      "You are an AI registrar assistant. Answer ONLY using the real fact sheet below. Do not invent any number or fact not listed. If asked something outside this fact sheet, say you don't have that data and suggest the relevant registrar page.\n\nReal registrar fact sheet:\n" +
        factSheet,
      parsed.data.message,
      fallback,
      parsed.data.message
    );

    await prisma.aiConversation.create({
      data: {
        userId: req.user!.id,
        context: "registrar-assistant",
        messages: {
          create: [
            { role: "user", content: parsed.data.message, sourceRefs: [] },
            { role: "assistant", content: reply, sourceRefs: [] },
          ],
        },
      },
    });

    res.json({ reply, factSheet });
  }
);

// FN039 — AI finance assistant. Same honest fact-sheet-grounded pattern as
// the registrar assistant above — real revenue/expense/AR/AP totals
// computed live, no true NL-to-SQL routing.
aiRouter.post(
  "/finance-assistant",
  requireAuth,
  requireRole("FINANCE_OFFICER", "ACCOUNTANT", "PRINCIPAL", "SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    // AI005
    if (!(await hasPermission(req.user!.role, "AI", "FINANCE_ASSISTANT"))) {
      return res.status(403).json({ message: "The AI finance assistant is disabled for your role." });
    }
    const parsed = tutorSchema.pick({ message: true }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Ask a finance question." });

    const [payments, expenses, unpaidExpenses, unpaidInvoices, activeHolds, trial] = await Promise.all([
      prisma.payment.aggregate({ _sum: { amount: true } }),
      prisma.expense.aggregate({ _sum: { amount: true } }),
      prisma.expense.aggregate({ _sum: { amount: true }, where: { paidAt: null } }),
      prisma.invoice.findMany({ where: { status: { in: ["unpaid", "partial", "overdue"] } } }),
      prisma.financialHold.count({ where: { releasedAt: null } }),
      computeTrialBalance(),
    ]);

    const totalReceivable = unpaidInvoices.reduce((s, i) => s + (Number(i.amountDue) - Number(i.amountPaid)), 0);

    const factSheet = `Total revenue collected: ${payments._sum.amount ?? 0}\nTotal expenses recorded: ${expenses._sum.amount ?? 0}\nNet position: ${Number(payments._sum.amount ?? 0) - Number(expenses._sum.amount ?? 0)}\nAccounts receivable (unpaid invoices): ${totalReceivable}\nAccounts payable (unpaid expenses): ${unpaidExpenses._sum.amount ?? 0}\nActive financial holds: ${activeHolds}\nLedger balanced: ${trial.balanced ? "yes" : "NO — needs investigation"}`;

    const fallback = `Here's the current finance fact sheet:\n\n${factSheet}\n\nFor line-item detail, use the Ledger, Accounts Receivable, or Accounts Payable pages directly.`;

    const reply = await callClaude(
      "finance-assistant",
      req.user!.id,
      req.user!.role,
      "You are an AI finance assistant. Answer ONLY using the real fact sheet below. Do not invent any number not listed. If asked something outside this fact sheet, say you don't have that data.\n\nReal finance fact sheet:\n" +
        factSheet,
      parsed.data.message,
      fallback,
      parsed.data.message
    );

    await prisma.aiConversation.create({
      data: {
        userId: req.user!.id,
        context: "finance-assistant",
        messages: {
          create: [
            { role: "user", content: parsed.data.message, sourceRefs: [] },
            { role: "assistant", content: reply, sourceRefs: [] },
          ],
        },
      },
    });

    res.json({ reply, factSheet });
  }
);

// ---------------------------------------------------------------------------
// AD038/039 — AI administrative assistant + AI report generator. Same
// fact-sheet-grounded discipline as every other AI assistant in this
// codebase, this time combining registry, finance, and QA-adjacent counts
// into one institution-wide fact sheet. The assistant answers questions
// about it; the report generator turns the same real facts into a written
// narrative — two different output shapes over the same real data, not
// two different levels of invention.
// ---------------------------------------------------------------------------

async function buildInstitutionalFactSheet() {
  const [programmes, payments, expenses, pendingAppeals, pendingAmendments, activeHolds, trial] = await Promise.all([
    prisma.programme.findMany({ include: { students: true } }),
    prisma.payment.aggregate({ _sum: { amount: true } }),
    prisma.expense.aggregate({ _sum: { amount: true } }),
    prisma.appeal.count({ where: { status: { in: ["submitted", "under_review"] } } }),
    prisma.resultsAmendmentRequest.count({ where: { status: "pending" } }),
    prisma.financialHold.count({ where: { releasedAt: null } }),
    computeTrialBalance(),
  ]);

  const totalStudents = programmes.reduce((s, p) => s + p.students.length, 0);
  const byProgramme = programmes.map((p) => `${p.name}: ${p.students.length} students`).join("\n");

  return `Total students: ${totalStudents}\nBy programme:\n${byProgramme}\nTotal revenue collected: ${payments._sum.amount ?? 0}\nTotal expenses recorded: ${expenses._sum.amount ?? 0}\nPending appeals: ${pendingAppeals}\nPending results amendments: ${pendingAmendments}\nActive financial holds: ${activeHolds}\nLedger balanced: ${trial.balanced ? "yes" : "NO"}`;
}

aiRouter.post(
  "/admin-assistant",
  requireAuth,
  requireRole("PRINCIPAL", "DEPUTY_PRINCIPAL", "SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    // AI005
    if (!(await hasPermission(req.user!.role, "AI", "ADMIN_ASSISTANT"))) {
      return res.status(403).json({ message: "The AI administrative assistant is disabled for your role." });
    }
    const parsed = tutorSchema.pick({ message: true }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Ask an administrative question." });

    const factSheet = await buildInstitutionalFactSheet();
    const fallback = `Here's the current institutional fact sheet:\n\n${factSheet}`;

    const reply = await callClaude(
      "admin-assistant",
      req.user!.id,
      req.user!.role,
      "You are an AI administrative assistant. Answer ONLY using the real fact sheet below. Do not invent any number not listed.\n\nReal institutional fact sheet:\n" +
        factSheet,
      parsed.data.message,
      fallback,
      parsed.data.message
    );

    await prisma.aiConversation.create({
      data: {
        userId: req.user!.id,
        context: "admin-assistant",
        messages: { create: [{ role: "user", content: parsed.data.message, sourceRefs: [] }, { role: "assistant", content: reply, sourceRefs: [] }] },
      },
    });

    res.json({ reply, factSheet });
  }
);

aiRouter.post(
  "/generate-report",
  requireAuth,
  requireRole("PRINCIPAL", "DEPUTY_PRINCIPAL", "SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    // AI005
    if (!(await hasPermission(req.user!.role, "AI", "GENERATE_REPORT"))) {
      return res.status(403).json({ message: "The AI report generator is disabled for your role." });
    }
    const factSheet = await buildInstitutionalFactSheet();
    const fallback = `INSTITUTIONAL SUMMARY REPORT\nGenerated: ${new Date().toLocaleString()}\n\n${factSheet}\n\n(Narrative generation requires ANTHROPIC_API_KEY to be configured; showing the raw fact sheet instead of a written summary.)`;

    const report = await callClaude(
      "generate-report",
      req.user!.id,
      req.user!.role,
      "Write a short, plain-language institutional summary report using ONLY the real facts below. Do not invent any number not listed. Structure it with a brief overview paragraph followed by key figures.\n\nReal institutional fact sheet:\n" +
        factSheet,
      "Generate this month's institutional summary report.",
      fallback
    );

    res.json({ report, factSheet, generatedAt: new Date() });
  }
);

// ---------------------------------------------------------------------------
// AI018 / LB021 / LB022 / LB023 — AI research assistant, covering research-
// gap analysis, research-question development, and methodology advice in
// one tool. Honest about its real limit: it is grounded ONLY in what the
// researcher has actually entered for their own project (title, abstract,
// milestones, bibliography count, literature matrix entries) — it does
// NOT claim to have read or indexed the actual source documents, since
// this system has no full-text indexing (LB004) or embeddings (AI011).
// ---------------------------------------------------------------------------
aiRouter.post("/research-assistant", requireAuth, async (req: AuthedRequest, res) => {
  // AI005
  if (!(await hasPermission(req.user!.role, "AI", "RESEARCH_ASSISTANT"))) {
    return res.status(403).json({ message: "The AI research assistant is disabled for your role." });
  }
  const parsed = z
    .object({ projectId: z.string(), mode: z.enum(["gap_analysis", "research_question", "methodology"]), message: z.string().optional() })
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Provide projectId and a mode." });

  const project = await prisma.researchProject.findUnique({
    where: { id: parsed.data.projectId },
    include: { milestones: true, bibliography: true, literatureMatrix: true },
  });
  if (!project) return res.status(404).json({ message: "Project not found." });
  if (project.leadUserId !== req.user!.id) return res.status(403).json({ message: "Not your project." });

  const factSheet = `Project: ${project.title}\nType: ${project.type}\nAbstract: ${project.abstract ?? "Not written yet"}\nMilestones: ${project.milestones.map((m) => `${m.title} (${m.status})`).join(", ") || "None recorded"}\nBibliography entries: ${project.bibliography.length}\nLiterature matrix entries: ${project.literatureMatrix.length}\nLiterature matrix findings so far: ${project.literatureMatrix.map((m) => m.keyFindings).filter(Boolean).join("; ") || "None recorded yet"}`;

  const prompts: Record<string, string> = {
    gap_analysis:
      "Based ONLY on the real project facts below (not any assumed knowledge of the wider literature, which you have not been given), suggest what additional literature review or data this researcher likely still needs to identify a genuine gap. Be explicit that you cannot see the actual source documents, only what they've logged.",
    research_question:
      "Based ONLY on the real project facts below, help draft 2-3 candidate research questions consistent with the stated abstract and findings so far. Do not claim novelty you cannot verify.",
    methodology:
      "Based ONLY on the real project facts below, suggest methodology considerations (design, data collection, analysis) appropriate to a project at this stage. Flag that a supervisor must confirm final methodology choices.",
  };

  const fallback = `Here's what's on record for this project:\n\n${factSheet}\n\nWith ANTHROPIC_API_KEY not configured, this tool can only show you the real facts above rather than draft the advisory text — the fallback here is the honest data, not fabricated advice.`;

  const researchMessage = parsed.data.message ?? `Help me with ${parsed.data.mode.replace("_", " ")} for this project.`;
  const reply = await callClaude(
    `research-assistant:${parsed.data.mode}`,
    req.user!.id,
    req.user!.role,
    prompts[parsed.data.mode] + "\n\nReal project facts:\n" + factSheet,
    researchMessage,
    fallback,
    parsed.data.message
  );

  await prisma.aiConversation.create({
    data: {
      userId: req.user!.id,
      context: `research-assistant:${parsed.data.mode}`,
      messages: { create: [{ role: "assistant", content: reply, sourceRefs: [] }] },
    },
  });

  res.json({ reply, factSheet });
});

// ---------------------------------------------------------------------------
// AI019 / LB036 — AI librarian. Grounded ONLY in the real catalogue search
// results for the query — never claims to have read or summarized the
// actual content of a resource, since there is no full-text indexing.
// ---------------------------------------------------------------------------
aiRouter.post("/librarian", requireAuth, async (req: AuthedRequest, res) => {
  // AI005
  if (!(await hasPermission(req.user!.role, "AI", "LIBRARIAN"))) {
    return res.status(403).json({ message: "The AI librarian is disabled for your role." });
  }
  const parsed = z.object({ message: z.string().min(1) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Ask a library question." });

  const matches = await prisma.libraryResource.findMany({
    where: {
      OR: [
        { title: { contains: parsed.data.message, mode: "insensitive" } },
        { subject: { contains: parsed.data.message, mode: "insensitive" } },
        { author: { contains: parsed.data.message, mode: "insensitive" } },
      ],
    },
    take: 10,
  });

  const factSheet = matches.length
    ? matches.map((m) => `- "${m.title}"${m.author ? ` by ${m.author}` : ""} (${m.type}, subject: ${m.subject ?? "unspecified"})`).join("\n")
    : "No catalogue matches found for this query.";

  const fallback = matches.length
    ? `Catalogue matches for your query:\n\n${factSheet}`
    : "No catalogue matches were found — try a different search term or browse the catalogue directly.";

  const reply = await callClaude(
    "librarian",
    req.user!.id,
    req.user!.role,
    "You are a library assistant. You can ONLY see the catalogue metadata below (title/author/subject/type) — you have NOT read the actual content of any resource, so never summarize or describe what's inside one. Just help the user find and choose among the real matches listed.\n\nReal catalogue matches:\n" +
      factSheet,
    parsed.data.message,
    fallback,
    parsed.data.message
  );

  res.json({ reply, matches });
});

// ---------------------------------------------------------------------------
// LB020 — Literature summarizer. Runs the same federated search LB002/037
// use (internal catalogue plus DOAJ/Crossref/arXiv/CORE/Internet Archive —
// see lib/repositories/federated.ts), then asks the model to synthesize
// ONLY the real abstracts/summaries those APIs actually returned. This is
// deliberately different from AI019/LB036's librarian: that tool never
// touches resource content because the internal catalogue has none to
// read. Here, DOAJ/Crossref/arXiv/CORE genuinely hand back abstract text
// with each result, so summarizing across the retrieved abstracts is real
// synthesis of fetched text, not a claim to have read a paper's full body
// — the prompt below says so explicitly and the source list is returned
// alongside the summary so a student can verify against the originals.
// ---------------------------------------------------------------------------
aiRouter.post("/literature-summary", requireAuth, async (req: AuthedRequest, res) => {
  // AI005
  if (!(await hasPermission(req.user!.role, "AI", "LITERATURE_SUMMARY"))) {
    return res.status(403).json({ message: "The literature summarizer is disabled for your role." });
  }
  const parsed = z.object({ topic: z.string().min(1).max(300) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Give a research topic to summarize." });

  const { results, statuses } = await federatedLibrarySearch(parsed.data.topic);
  const withAbstracts = results.filter((r) => r.abstract && r.abstract.trim().length > 0).slice(0, 12);

  if (withAbstracts.length === 0) {
    return res.json({
      reply:
        "No source returned an abstract for this topic yet — either nothing matched, or only sources without abstract text (like the internal catalogue or DSpace/EPrints/Islandora/Greenstone connectors) had results. Try a broader topic, or check /library/repository-status if DOAJ/Crossref/arXiv/CORE/Internet Archive are unexpectedly all unreachable.",
      sources: results.map((r) => ({ title: r.title, source: r.source, url: r.url })),
      statuses,
    });
  }

  const factSheet = withAbstracts
    .map((r, i) => `[${i + 1}] "${r.title}"${r.author ? ` — ${r.author}` : ""} (${r.source})\n${r.abstract}`)
    .join("\n\n");

  const fallback =
    `ANTHROPIC_API_KEY is not configured, so here are the real abstracts retrieved instead of a written synthesis:\n\n${factSheet}`;

  const reply = await callClaude(
    "literature-summary",
    req.user!.id,
    req.user!.role,
    "You are a literature-review assistant for TVET students and researchers. Summarize themes, points of agreement, and points of disagreement ONLY using the numbered abstracts below — every claim must trace to one of them, and you must cite sources by their [number]. Never claim to have read a paper's full text or methodology beyond what its abstract states. If the abstracts don't cover something, say so instead of filling the gap from general knowledge.\n\nRetrieved abstracts:\n" +
      factSheet,
    `Summarize the current literature on: ${parsed.data.topic}`,
    fallback,
    parsed.data.topic
  );

  res.json({
    reply,
    sources: withAbstracts.map((r, i) => ({ number: i + 1, title: r.title, source: r.source, url: r.url })),
    statuses,
  });
});

// ---------------------------------------------------------------------------
// AI022 / QA040 — AI QA assistant, grounded in real ComplianceRequirement
// and CorrectiveAction data — identifies genuine compliance risks (an
// expired review, an overdue corrective action) rather than making a
// judgment call about actual regulatory compliance, which dev rule 19
// explicitly warns this system must never claim on a feature's behalf.
// ---------------------------------------------------------------------------
aiRouter.post(
  "/qa-assistant",
  requireAuth,
  requireRole("QA_OFFICER", "PRINCIPAL", "SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    // AI005
    if (!(await hasPermission(req.user!.role, "AI", "QA_ASSISTANT"))) {
      return res.status(403).json({ message: "The AI QA assistant is disabled for your role." });
    }
    const parsed = z.object({ message: z.string().min(1) }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Ask a QA question." });

    const now = new Date();
    const requirements = await prisma.complianceRequirement.findMany({ include: { correctiveActions: true } });
    const overdueReview = requirements.filter((r) => r.nextReviewDue && r.nextReviewDue < now);
    const notMet = requirements.filter((r) => r.status !== "met");
    const openActions = requirements.flatMap((r) => r.correctiveActions.filter((a) => a.status !== "closed"));
    const overdueActions = openActions.filter((a) => a.dueDate && a.dueDate < now);

    const factSheet = `Total compliance requirements tracked: ${requirements.length}\nNot yet met: ${notMet.length}\nOverdue for review: ${overdueReview.length}\nOpen corrective actions: ${openActions.length}\nOverdue corrective actions: ${overdueActions.length}${overdueActions.length ? "\nOverdue action details: " + overdueActions.map((a) => a.description).join("; ") : ""}`;

    const fallback = `Here's the real QA fact sheet:\n\n${factSheet}\n\nThis tool identifies risks from the data on record — it cannot certify actual regulatory compliance on the institution's behalf.`;

    const reply = await callClaude(
      "qa-assistant",
      req.user!.id,
      req.user!.role,
      "You are a QA assistant. Answer ONLY using the real fact sheet below. Never claim the institution IS compliant — only report what the data shows (requirements not yet met, overdue reviews, overdue corrective actions). Certifying actual compliance requires human QA officer judgment.\n\nReal QA fact sheet:\n" +
        factSheet,
      parsed.data.message,
      fallback,
      parsed.data.message
    );

    res.json({ reply, factSheet });
  }
);

// ---------------------------------------------------------------------------
// AI027 / TP037 — AI remediation generator: grounded in the same real
// at-risk signals a trainer already sees in TrainerAtRisk.tsx (no login,
// missed deadline, dropping score) — suggests intervention ideas for a
// specific flagged student rather than inventing generic advice
// disconnected from why they were actually flagged.
// ---------------------------------------------------------------------------
aiRouter.post(
  "/remediation-generator",
  requireAuth,
  requireRole("TRAINER", "SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    // AI005
    if (!(await hasPermission(req.user!.role, "AI", "REMEDIATION_GENERATOR"))) {
      return res.status(403).json({ message: "The AI remediation generator is disabled for your role." });
    }
    const parsed = z
      .object({ studentName: z.string().min(1), signals: z.array(z.string()).min(1) })
      .safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Provide studentName and at least one real signal." });

    const factSheet = `Student: ${parsed.data.studentName}\nFlags on record: ${parsed.data.signals.join("; ")}`;

    const fallback = `Flags on record for ${parsed.data.studentName}:\n\n${parsed.data.signals.join("\n")}\n\nConsider a direct check-in addressing each flag specifically.`;

    const reply = await callClaude(
      "remediation-generator",
      req.user!.id,
      req.user!.role,
      "You help a trainer draft a remediation/intervention plan for a flagged student, using ONLY the real flags listed below. Do not invent a cause not evidenced by the flags. Suggest concrete, specific actions tied to each flag.\n\nReal flags:\n" +
        factSheet,
      `Suggest a remediation plan for ${parsed.data.studentName}.`,
      fallback
    );

    res.json({ reply });
  }
);

// ---------------------------------------------------------------------------
// TP017 / EX022 — AI marking assistant. Drafts a suggested score and
// feedback against the assessment's real rubric criteria and the
// student's real submitted text — but this is ALWAYS a draft: the
// existing grade endpoint (POST /exams/submissions/:id/grade) still
// requires a human trainer to actually record the score, matching dev
// rule 19's "manual override" requirement (TP019) and the AI operating
// principle (AI recommendation -> human review -> authorized decision).
// This endpoint never writes to Submission.score itself.
// ---------------------------------------------------------------------------
aiRouter.post(
  "/marking-assistant",
  requireAuth,
  requireRole("TRAINER", "EXAMINATION_OFFICER", "SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    // AI005
    if (!(await hasPermission(req.user!.role, "AI", "MARKING_ASSISTANT"))) {
      return res.status(403).json({ message: "The AI marking assistant is disabled for your role." });
    }
    const parsed = z.object({ submissionId: z.string() }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Provide submissionId." });

    const submission = await prisma.submission.findUnique({
      where: { id: parsed.data.submissionId },
      include: { assessment: { include: { rubric: true } }, assignment: true },
    });
    if (!submission) return res.status(404).json({ message: "Submission not found." });
    if (!submission.textAnswer) {
      return res.status(400).json({ message: "This submission has no text answer for the assistant to read (e.g. a file-only submission)." });
    }

    const totalMarks = submission.assessment?.totalMarks ?? 0;
    const rubricCriteria = submission.assessment?.rubric?.criteria;
    const rubricText = rubricCriteria
      ? JSON.stringify(rubricCriteria)
      : "No rubric was set for this assessment — use the total marks only.";

    const factSheet = `Total marks available: ${totalMarks}\nRubric criteria: ${rubricText}\nStudent's submitted answer:\n${submission.textAnswer}`;

    const fallback = `Rubric and submission on record:\n\n${factSheet}\n\n(Draft scoring requires ANTHROPIC_API_KEY to be configured — showing the raw material instead of a suggested score.)`;

    const reply = await callClaude(
      "marking-assistant",
      req.user!.id,
      req.user!.role,
      "You are a marking assistant helping a trainer grade a submission. Using ONLY the real rubric and submission text below, suggest a score out of the total marks and brief feedback. Be explicit this is a DRAFT suggestion only — the trainer must review and enter the final grade themselves; you are not authorized to finalize any grade.\n\nReal rubric and submission:\n" +
        factSheet,
      "Suggest a score and feedback for this submission.",
      fallback
    );

    // TP018 — this used to just return `reply` and forget it ever
    // happened: the trainer read it, and it was gone. AiFeedbackSession
    // existed in the schema (Batch 44) with a full trainer-review shape
    // (isAccepted/acceptedAt/trainerModifications) but had zero routes
    // touching it — a dead model exactly like EX004's learning-outcomes.ts
    // was a dead file before Batch 48. Now every suggestion is a real,
    // reviewable session a trainer can look back on and — via the two
    // routes below — actually apply into Submission.feedback.
    const session = await prisma.aiFeedbackSession.create({
      data: {
        submissionId: submission.id,
        rubricId: submission.assessment?.rubric?.id,
        generatedFeedback: reply,
        trainerId: req.user!.id,
      },
    });

    res.json({ suggestion: reply, totalMarks, sessionId: session.id });
  }
);

// TP018 continued — history of AI-drafted feedback for one submission
// (most recent first), so a trainer can see what was already suggested
// and whether it was ever applied, instead of re-generating blind.
aiRouter.get(
  "/feedback-sessions/submission/:submissionId",
  requireAuth,
  requireRole("TRAINER", "EXAMINATION_OFFICER", "SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    const sessions = await prisma.aiFeedbackSession.findMany({
      where: { submissionId: req.params.submissionId },
      orderBy: { createdAt: "desc" },
    });
    res.json(sessions);
  }
);

// TP018 continued — the actual human-review step. `accept: false` still
// records that the trainer looked at it and chose NOT to use it (real
// governance trail); only `accept: true` writes into the real
// Submission.feedback field — and only the feedback text, never a score,
// matching the marking-assistant's existing "never writes Submission.score
// itself" discipline (TP017/EX022/TP019).
const applyFeedbackSchema = z.object({ finalFeedback: z.string().min(1), accept: z.boolean() });
aiRouter.patch(
  "/feedback-sessions/:id/apply",
  requireAuth,
  requireRole("TRAINER", "EXAMINATION_OFFICER", "SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    const parsed = applyFeedbackSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Provide finalFeedback and accept." });

    const session = await prisma.aiFeedbackSession.findUnique({ where: { id: req.params.id } });
    if (!session) return res.status(404).json({ message: "Feedback session not found." });

    const wasModified = parsed.data.finalFeedback.trim() !== session.generatedFeedback.trim();

    const [updatedSession] = await prisma.$transaction([
      prisma.aiFeedbackSession.update({
        where: { id: session.id },
        data: {
          isAccepted: parsed.data.accept,
          acceptedAt: new Date(),
          trainerModifications: wasModified ? parsed.data.finalFeedback : null,
        },
      }),
      ...(parsed.data.accept
        ? [prisma.submission.update({ where: { id: session.submissionId }, data: { feedback: parsed.data.finalFeedback } })]
        : []),
    ]);

    res.json(updatedSession);
  }
);

// ---------------------------------------------------------------------------
// TP035 — AI lesson generator. The "lesson-plan" trainer-assist draft used
// to just sit in a <pre> tag with a dead "Approve & publish" button — this
// is the actual apply step, creating a real Lesson through the same
// authoring path TP004/TP006 already use (content.ts), so a saved draft
// shows up for students exactly like a hand-written lesson does (and can
// be edited/versioned/approved afterward through the normal content flow).
// ---------------------------------------------------------------------------
const saveAsLessonSchema = z.object({
  moduleId: z.string(),
  title: z.string().min(2),
  content: z.string().min(1),
});
aiRouter.post(
  "/trainer-assist/save-as-lesson",
  requireAuth,
  requireRole("TRAINER", "SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    if (!(await hasPermission(req.user!.role, "AI", "TRAINER_ASSIST"))) {
      return res.status(403).json({ message: "AI trainer assistance is disabled for your role." });
    }
    const parsed = saveAsLessonSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Provide moduleId, title and content." });

    const module_ = await prisma.courseModule.findUnique({ where: { id: parsed.data.moduleId } });
    if (!module_) return res.status(404).json({ message: "Module not found." });
    if (!(await canTeachCourse(req.user!, module_.courseId))) return res.status(403).json({ message: "You don't teach this course." });

    const existingCount = await prisma.lesson.count({ where: { moduleId: parsed.data.moduleId } });
    const lesson = await prisma.lesson.create({
      data: {
        moduleId: parsed.data.moduleId,
        title: parsed.data.title,
        order: existingCount + 1,
        contentType: "reading",
        contentBody: `[AI-drafted — reviewed and saved by trainer]\n\n${parsed.data.content}`,
        // Saved as a draft: finish it in the Lesson Builder, then publish.
        isPublished: false,
      },
    });
    res.status(201).json(lesson);
  }
);

// ---------------------------------------------------------------------------
// TP036 — AI question generator. Same dead-button problem as TP035, but a
// quiz draft is unstructured prose — parsing arbitrary AI text into real
// Question rows is unreliable, so this asks for (or, without an API key,
// deterministically builds) STRUCTURED items grounded in the real approved
// topics, which the trainer reviews and edits before anything is saved —
// then /save-questions below writes them through the exact same
// questionSchema POST /exams/questions already validates against.
// ---------------------------------------------------------------------------
const generateQuizQuestionsSchema = z.object({
  unit: z.string(),
  count: z.number().int().min(1).max(10).default(5),
});
type DraftQuestion = {
  type: "mcq" | "short_answer" | "essay";
  prompt: string;
  options: string[];
  correctAnswer?: string;
  marks: number;
  difficulty: "easy" | "medium" | "hard";
};
aiRouter.post("/trainer-assist/generate-quiz-questions", requireAuth, async (req: AuthedRequest, res) => {
  if (!(await hasPermission(req.user!.role, "AI", "TRAINER_ASSIST"))) {
    return res.status(403).json({ message: "AI trainer assistance is disabled for your role." });
  }
  const parsed = generateQuizQuestionsSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Provide a unit and a question count from 1-10." });

  const { unit, count } = parsed.data;
  const topics = findRelevantTopics(unit, "");

  let questions: DraftQuestion[] = [];

  if (topics.length) {
    const result = await callAiModel({
      feature: "generate-quiz-questions",
      userId: req.user!.id,
      role: req.user!.role,
      maxTokens: 1200,
      system:
        "You draft short-answer quiz questions for a TVET trainer, grounded ONLY in the approved material below. " +
        "Respond with ONLY a raw JSON array (no markdown fences, no commentary) of objects shaped exactly like: " +
        '{"type":"short_answer","prompt":"...","marks":2,"difficulty":"easy|medium|hard"}. ' +
        "Every prompt must be answerable directly from the material given — never invent facts outside it.\n\nApproved material:\n" +
        topics.map((t) => `${t.title}: ${t.summary}`).join("\n"),
      messages: [{ role: "user", content: `Draft ${count} short-answer quiz questions.` }],
    });
    if (result.ok) {
      try {
        const parsedJson = JSON.parse(result.text.trim().replace(/^```json\n?|```$/g, ""));
        if (Array.isArray(parsedJson)) {
          questions = parsedJson
            .filter((q) => q && typeof q.prompt === "string" && q.prompt.length > 3)
            .slice(0, count)
            .map((q) => ({
              type: "short_answer" as const,
              prompt: q.prompt,
              options: [],
              marks: Number.isFinite(q.marks) ? q.marks : 2,
              difficulty: ["easy", "medium", "hard"].includes(q.difficulty) ? q.difficulty : "medium",
            }));
        }
      } catch {
        questions = [];
      }
    }
  }

  // Honest deterministic fallback — no API key, or the model call/parse
  // failed: still real, usable questions grounded in the real approved
  // topics on file, not a generic placeholder. Unscored (no
  // correctAnswer) since these need a human's judgement to mark, same as
  // any other short_answer question in the bank.
  if (questions.length === 0) {
    questions = topics.slice(0, count).map((t) => ({
      type: "short_answer" as const,
      prompt: `In your own words, explain: ${t.title}.`,
      options: [],
      marks: 2,
      difficulty: "medium" as const,
    }));
  }

  res.json({ questions, groundedIn: topics.map((t) => t.sourceRef) });
});

const saveQuestionsSchema = z.object({
  unitId: z.string(),
  questions: z.array(questionSchema.omit({ unitId: true })).min(1).max(20),
});
aiRouter.post(
  "/trainer-assist/save-questions",
  requireAuth,
  requireRole("TRAINER", "EXAMINATION_OFFICER", "SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    const parsed = saveQuestionsSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid question list." });

    const unit = await prisma.unit.findUnique({ where: { id: parsed.data.unitId } });
    if (!unit) return res.status(404).json({ message: "Unit not found." });

    const created = await prisma.$transaction(
      parsed.data.questions.map((q) =>
        prisma.question.create({ data: { ...q, options: q.options ?? [], unitId: parsed.data.unitId } })
      )
    );
    res.status(201).json({ created: created.length, questions: created });
  }
);

// ---------------------------------------------------------------------------
// AI038 — human escalation. Previously the tutor (and every other
// assistant) could only refuse an ungrounded question in-band; there was
// no formal handoff to a person. This reuses the real HelpdeskTicket model
// (already had an unused `handledByAi` flag on it — see routes/support.ts)
// instead of inventing a parallel ticket system: an escalation IS a
// helpdesk ticket, just one flagged as AI-originated and pre-filled with
// what the student actually asked (and what the assistant told them, if
// anything), so the counsellor/registrar picking it up has real context
// instead of a blank ticket.
// ---------------------------------------------------------------------------
const escalateSchema = z.object({
  context: z.string().min(1).max(120), // e.g. "tutor:unit-id" — same convention as AiConversation.context
  message: z.string().min(1).max(2000),
  aiReply: z.string().max(4000).optional(),
});
aiRouter.post("/escalate", requireAuth, async (req: AuthedRequest, res) => {
  const parsed = escalateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Provide the context and your question." });

  const student = await prisma.student.findUnique({ where: { userId: req.user!.id } });

  const ticket = await prisma.helpdeskTicket.create({
    data: {
      raisedById: req.user!.id,
      studentId: student?.id,
      subject: `AI escalation — ${parsed.data.context}`,
      body: parsed.data.aiReply
        ? `Question:\n${parsed.data.message}\n\nWhat the AI assistant said:\n${parsed.data.aiReply}`
        : `Question:\n${parsed.data.message}`,
      status: "escalated",
      handledByAi: true,
    },
  });

  res.status(201).json(ticket);
});

// ---------------------------------------------------------------------------
// AI040 — AI governance centre. Reads the AI_FEATURE_CATALOG and
// AiUsageLog data the gateway (lib/ai-gateway.ts) writes on every call, so
// a principal/super-admin can see real per-feature call volume, failure
// and safety-block counts, and which RolePermission overrides (AI005)
// currently apply — none of this existed before this batch; there was
// nothing to look at.
// ---------------------------------------------------------------------------
aiRouter.get(
  "/governance/usage",
  requireAuth,
  requireRole("PRINCIPAL", "DEPUTY_PRINCIPAL", "SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    const days = Number(req.query.days) || 30;
    const stats = await getAiUsageStats(Math.min(Math.max(days, 1), 365));
    res.json(stats);
  }
);

aiRouter.get(
  "/governance/feature-catalog",
  requireAuth,
  requireRole("PRINCIPAL", "DEPUTY_PRINCIPAL", "SUPER_ADMIN"),
  async (_req: AuthedRequest, res) => {
    const overrides = await prisma.rolePermission.findMany({ where: { resourceType: "AI" } });
    const catalogue = AI_FEATURE_CATALOG.map((f) => ({
      ...f,
      overrides: overrides.filter((o) => o.action === f.action).map((o) => ({ role: o.roleName, isGranted: o.isGranted })),
    }));
    res.json(catalogue);
  }
);

aiRouter.get(
  "/governance/safety-log",
  requireAuth,
  requireRole("PRINCIPAL", "DEPUTY_PRINCIPAL", "SUPER_ADMIN"),
  async (_req: AuthedRequest, res) => {
    const blocks = await getRecentSafetyBlocks(50);
    res.json(blocks);
  }
);

// AI002 — Model management. Read is available to the same governance
// audience as the rest of this page; editing is restricted to SUPER_ADMIN
// — which real model string the whole institution's AI traffic runs
// through is a narrower call than viewing usage stats.
aiRouter.get(
  "/governance/model-config",
  requireAuth,
  requireRole("PRINCIPAL", "DEPUTY_PRINCIPAL", "SUPER_ADMIN"),
  async (_req: AuthedRequest, res) => {
    res.json(await getActiveModelConfig());
  }
);

const modelConfigSchema = z.object({
  modelId: z.string().min(3).max(200),
  notes: z.string().max(500).optional(),
});

aiRouter.patch(
  "/governance/model-config",
  requireAuth,
  requireRole("SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    const parsed = modelConfigSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "A model id is required." });
    const updated = await setActiveModelConfig(parsed.data.modelId, req.user!.id, parsed.data.notes);
    await prisma.auditLog.create({
      data: { userId: req.user!.id, action: "AI_MODEL_CONFIG_CHANGED", entityType: "AiModelConfig", entityId: "default", metadata: { modelId: parsed.data.modelId } },
    });
    res.json(updated);
  }
);
