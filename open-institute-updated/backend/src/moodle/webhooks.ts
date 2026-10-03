// Moodle integration — inbound event webhooks.
//
// Moodle core has no built-in outbound webhook system. The documented
// way to get one is the tool_trigger plugin (Catalyst IT —
// moodle.org/plugins/tool_trigger, "like IFTTT for Moodle: events to
// trigger external services"), configured to POST matching Moodle
// events to the URL this router exposes.
//
// tool_trigger's exact payload shape is configurable per rule you set
// up in Moodle admin, so the shape assumed below (eventname, userid,
// courseid, other) is a reasonable default matching tool_trigger's
// typical webhook step — CONFIRM it against what your configured rules
// actually send before relying on this in production, and adjust
// parseEvent() to match.
//
// Every event here is authenticated (shared secret header), logged before
// processing, and deduplicated only after successful processing so a failed
// delivery can be retried by Moodle.

import { Router } from "express";
import { prisma } from "../lib/prisma.js";

export const moodleWebhooksRouter = Router();

const WEBHOOK_SECRET = process.env.MOODLE_WEBHOOK_SECRET;

interface IncomingMoodleEvent {
  eventname: string; // e.g. "\\mod_quiz\\event\\attempt_submitted"
  userid?: number;
  courseid?: number;
  objectid?: number;
  timecreated?: number;
  other?: Record<string, unknown>;
}

moodleWebhooksRouter.post("/events", async (req, res) => {
  if (!WEBHOOK_SECRET) {
    return res.status(503).json({ message: "Moodle webhook intake is not configured." });
  }

  const provided = req.headers["x-moodle-webhook-secret"];
  if (provided !== WEBHOOK_SECRET) {
    return res.status(401).json({ message: "Invalid webhook secret." });
  }

  const event = req.body as IncomingMoodleEvent;
  if (!event?.eventname) {
    return res.status(400).json({ message: "Missing eventname." });
  }

  // Idempotency: dedupe on (eventname, objectid, timecreated) — the
  // closest thing to a stable natural key tool_trigger's payload gives
  // us without a dedicated event id field.
  const eventKey = `${event.eventname}:${event.objectid ?? ""}:${event.timecreated ?? ""}`;

  try {
    const already = await prisma.auditLog.findFirst({
      where: { action: "MOODLE_WEBHOOK_PROCESSED", entityId: eventKey },
    });
    if (already) {
      return res.status(200).json({ status: "duplicate_ignored" });
    }

    await prisma.auditLog.create({
      data: {
        userId: await resolveLocalUserId(event.userid),
        action: "MOODLE_WEBHOOK_RECEIVED",
        entityType: "MoodleEvent",
        entityId: eventKey,
      },
    });

    await routeEvent(event);
    await prisma.auditLog.create({
      data: {
        userId: await resolveLocalUserId(event.userid),
        action: "MOODLE_WEBHOOK_PROCESSED",
        entityType: "MoodleEvent",
        entityId: eventKey,
      },
    });

    res.status(200).json({ status: "ok" });
  } catch (err) {
    try {
      await prisma.auditLog.create({
        data: {
          userId: await resolveLocalUserId(event.userid),
          action: "MOODLE_WEBHOOK_FAILED",
          entityType: "MoodleEvent",
          entityId: eventKey,
          metadata: { message: err instanceof Error ? err.message.slice(0, 500) : "Unknown error" },
        },
      });
    } catch (auditErr) {
      // eslint-disable-next-line no-console
      console.error("Failed to persist Moodle webhook failure log", { eventKey, auditErr });
    }
    // eslint-disable-next-line no-console
    console.error("Moodle webhook processing failed", { eventKey, err });
    res.status(500).json({ status: "processing_failed" });
  }
});

async function resolveLocalUserId(moodleUserId?: number): Promise<string | undefined> {
  if (!moodleUserId) return undefined;
  const user = await prisma.user.findUnique({ where: { moodleUserId } });
  return user?.id;
}

/**
 * Maps a handful of Moodle event names onto existing app behaviour.
 * Deliberately small — extend as you confirm each event's real payload
 * shape against your tool_trigger configuration, rather than handling
 * every possible Moodle event speculatively.
 */
async function routeEvent(event: IncomingMoodleEvent): Promise<void> {
  const userId = await resolveLocalUserId(event.userid);
  if (!userId) return; // event for a user we have no local mapping for — nothing to update

  switch (event.eventname) {
    case "\\core\\event\\course_module_completion_updated":
    case "\\core\\event\\course_completed": {
      await prisma.notification.create({
        data: {
          userId,
          channel: "in_app",
          title: "Course progress updated",
          body: "Your Moodle course progress has been updated.",
        },
      });
      break;
    }
    default:
      // Recognised-but-unhandled events are logged (above) but don't
      // need app-side action yet.
      break;
  }
}
