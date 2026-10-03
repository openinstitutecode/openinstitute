import { Router, Request, Response } from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { prisma } from "../lib/prisma.js";
import { detectBrowserAnomalies, isUnusuallySmallScreen } from "../lib/exam-security-checks.js";

const router = Router();

// EX013 -- Exam session security: browser/environment checks
// NOTE: These checks are ADVISORY ONLY. We do not enforce lockdown or prevent exam taking.
// The system collects and flags potential issues for examiner review.
// Pure anomaly-detection logic lives in ../lib/exam-security-checks.ts and is unit-tested there.

// Staff who may read/review flags across students. A student may only
// trigger a check for (and may never read/review) their own session.
const STAFF_ROLES = ["EXAMINATION_OFFICER", "TRAINER", "DEPARTMENT_HEAD", "PROGRAMME_COORDINATOR", "SUPER_ADMIN"];

// Record security flags for an exam session.
// BUGFIX: this used to be reachable by ANY authenticated user for ANY
// session id, letting one student trigger (or overwrite) checks against
// another student's session. Now: a student may only check their own
// session; staff may check any session (e.g. an invigilator re-running it).
router.post("/:sessionId/check", requireAuth, async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const { userAgent, screenWidth, screenHeight } = req.body;
    const requester = (req as any).user;

    const session = await prisma.examSession.findUnique({ where: { id: sessionId } });
    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }

    const isOwner = requester?.id === session.studentUserId;
    const isStaff = STAFF_ROLES.includes(requester?.role);
    if (!isOwner && !isStaff) {
      return res.status(403).json({ error: "You don't have permission to check this session." });
    }

    const anomalies = detectBrowserAnomalies(userAgent || "");

    const flags = [];
    for (const anomaly of anomalies) {
      const flag = await prisma.examSessionSecurityFlag.create({
        data: {
          sessionId,
          flagType: anomaly.flagType,
          severity: anomaly.severity,
          details: `${anomaly.flagType} detected. Screen: ${screenWidth}×${screenHeight}. User-Agent: ${userAgent || "N/A"}`,
        },
      });
      flags.push(flag);
    }

    if (isUnusuallySmallScreen(screenWidth, screenHeight)) {
      const flag = await prisma.examSessionSecurityFlag.create({
        data: {
          sessionId,
          flagType: "small_screen",
          severity: "info",
          details: `Unusual screen size: ${screenWidth}×${screenHeight}`,
        },
      });
      flags.push(flag);
    }

    res.json({
      sessionId,
      flagsDetected: flags.length,
      flags,
      message: "Security check completed. Student may proceed with exam.",
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Get security flags for an exam session (for examiner review).
// BUGFIX: previously any authenticated user (including any student) could
// read any other student's flags. Restricted to staff roles.
router.get("/:sessionId/flags", requireAuth, requireRole(...STAFF_ROLES), async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const flags = await prisma.examSessionSecurityFlag.findMany({
      where: { sessionId },
      orderBy: { flaggedAt: "desc" },
    });
    res.json(flags);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Examiner reviews and marks a flag as reviewed.
// BUGFIX: previously any authenticated user could mark any flag reviewed.
// Restricted to staff roles.
router.patch(
  "/:sessionId/flags/:flagId/review",
  requireAuth,
  requireRole(...STAFF_ROLES),
  async (req: Request, res: Response) => {
    try {
      const { flagId } = req.params;
      const flag = await prisma.examSessionSecurityFlag.update({
        where: { id: flagId },
        data: {
          reviewedBy: (req as any).user?.id,
          reviewedAt: new Date(),
        },
      });
      res.json(flag);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);

// EX016 — Batch 56: continuous, automatic activity logging during an
// attempt (tab-switch/visibility changes), distinct from the one-time
// browser/environment check above. Same ownership rule as /check: a
// student may only log events for their own session; staff can log/read
// for any session. Advisory only — never blocks or ends an attempt.
const ACTIVITY_EVENT_TYPES = new Set(["tab_hidden", "tab_visible", "fullscreen_exit", "copy", "paste"]);

router.post("/:sessionId/activity", requireAuth, async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const { eventType } = req.body;
    const requester = (req as any).user;

    if (typeof eventType !== "string" || !ACTIVITY_EVENT_TYPES.has(eventType)) {
      return res.status(400).json({ error: "Unrecognized activity event type." });
    }

    const session = await prisma.examSession.findUnique({ where: { id: sessionId } });
    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }

    const isOwner = requester?.id === session.studentUserId;
    const isStaff = STAFF_ROLES.includes(requester?.role);
    if (!isOwner && !isStaff) {
      return res.status(403).json({ error: "You don't have permission to log activity for this session." });
    }

    const event = await prisma.examActivityEvent.create({
      data: { sessionId, eventType },
    });

    res.status(201).json(event);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Staff-only: the running activity log for a session, for an invigilator or
// examiner to review after the fact.
router.get("/:sessionId/activity", requireAuth, requireRole(...STAFF_ROLES), async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const events = await prisma.examActivityEvent.findMany({
      where: { sessionId },
      orderBy: { occurredAt: "asc" },
    });
    const tabHiddenCount = events.filter((e) => e.eventType === "tab_hidden").length;
    res.json({ sessionId, events, tabHiddenCount });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
