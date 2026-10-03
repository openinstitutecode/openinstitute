import { Router, Request, Response } from "express";
import { requireAuth } from "../middleware/auth.js";
import { prisma } from "../lib/prisma.js";

const router = Router();

// SP024 — Persistent AI Tutor sessions

// Create or get current session
router.post("/", requireAuth, async (req: Request, res: Response) => {
  try {
    const studentId = (req as any).user?.id;
    const unit: string | undefined = req.body?.unit;

    // SP024 — a session is now scoped to the unit being studied (when the
    // caller provides one), so switching units in the AI Tutor resumes
    // that unit's own conversation instead of one undifferentiated
    // 24-hour bucket shared across every unit.
    const existingSession = await prisma.tutorSession.findFirst({
      where: {
        studentId,
        isActive: true,
        ...(unit ? { unit } : {}),
        lastMessageAt: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
        },
      },
      include: { messages: { orderBy: { timestamp: "asc" } } },
    });
    
    if (existingSession) {
      return res.json(existingSession);
    }
    
    // Create new session
    const newSession = await prisma.tutorSession.create({
      data: {
        studentId,
        unit,
      },
      include: { messages: true },
    });
    
    res.json(newSession);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Get all sessions for logged-in student
router.get("/", requireAuth, async (req: Request, res: Response) => {
  try {
    const studentId = (req as any).user?.id;
    
    const sessions = await prisma.tutorSession.findMany({
      where: { studentId },
      include: {
        messages: { select: { id: true, role: true, timestamp: true } },
      },
      orderBy: { lastMessageAt: "desc" },
    });
    
    res.json(sessions);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Get specific session with all messages
router.get("/:sessionId", requireAuth, async (req: Request, res: Response) => {
  try {
    const studentId = (req as any).user?.id;
    const { sessionId } = req.params;
    
    const session = await prisma.tutorSession.findFirst({
      where: {
        id: sessionId,
        studentId,
      },
      include: { messages: { orderBy: { timestamp: "asc" } } },
    });
    
    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }
    
    res.json(session);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Add message to session
router.post("/:sessionId/messages", requireAuth, async (req: Request, res: Response) => {
  try {
    const studentId = (req as any).user?.id;
    const { sessionId } = req.params;
    const { role, content } = req.body;
    
    // Verify ownership
    const session = await prisma.tutorSession.findFirst({
      where: { id: sessionId, studentId },
    });
    
    if (!session) {
      return res.status(403).json({ error: "Unauthorized" });
    }
    
    // Add message
    const message = await prisma.tutorMessage.create({
      data: {
        sessionId,
        role: role || "student",
        content,
      },
    });
    
    // Update session metadata
    await prisma.tutorSession.update({
      where: { id: sessionId },
      data: {
        messagesCount: { increment: 1 },
        lastMessageAt: new Date(),
      },
    });
    
    res.json(message);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Update session notes
router.patch("/:sessionId", requireAuth, async (req: Request, res: Response) => {
  try {
    const studentId = (req as any).user?.id;
    const { sessionId } = req.params;
    const { sessionNotes, isActive } = req.body;
    
    // Verify ownership
    const session = await prisma.tutorSession.findFirst({
      where: { id: sessionId, studentId },
    });
    
    if (!session) {
      return res.status(403).json({ error: "Unauthorized" });
    }
    
    const updated = await prisma.tutorSession.update({
      where: { id: sessionId },
      data: {
        ...(sessionNotes !== undefined && { sessionNotes }),
        ...(isActive !== undefined && { isActive }),
      },
    });
    
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
