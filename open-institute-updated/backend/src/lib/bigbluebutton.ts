// TP026 — Live teaching, via a direct integration with a BigBlueButton
// server's own documented REST API (https://docs.bigbluebutton.org/dev/api.html).
// Every BBB API call is a GET request whose query string is signed with a
// checksum: sha1(apiCallName + queryString + sharedSecret) by default (BBB
// also supports sha256/sha512 on newer servers — configurable below since
// that's a real per-deployment setting, not something to guess at).
//
// Same "clearly not configured" discipline as the M-Pesa integration in
// finance.ts: with no BBB_SERVER_URL / BBB_SHARED_SECRET set, every function here
// throws BbbNotConfiguredError instead of silently no-op'ing or faking a
// join URL, so routes can surface an honest 503 rather than a broken button.

import { createHash, randomBytes } from "node:crypto";

export class BbbNotConfiguredError extends Error {
  constructor() {
    super("Live classes aren't configured yet. Set BBB_SERVER_URL and BBB_SHARED_SECRET to enable BigBlueButton video conferencing.");
    this.name = "BbbNotConfiguredError";
  }
}

function getConfig() {
  const serverUrl = process.env.BBB_SERVER_URL?.replace(/\/+$/, "");
  const secret = process.env.BBB_SHARED_SECRET;
  const algorithm = (process.env.BBB_CHECKSUM_ALGORITHM || "sha1") as "sha1" | "sha256" | "sha512";
  if (!serverUrl || !secret) throw new BbbNotConfiguredError();
  return { serverUrl, secret, algorithm };
}

export function isBbbConfigured(): boolean {
  return Boolean(process.env.BBB_SERVER_URL && process.env.BBB_SHARED_SECRET);
}

function buildQuery(params: Record<string, string | number | boolean | undefined>): string {
  const usp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    usp.append(key, String(value));
  }
  return usp.toString();
}

function sign(apiCallName: string, query: string, secret: string, algorithm: "sha1" | "sha256" | "sha512"): string {
  return createHash(algorithm).update(apiCallName + query + secret).digest("hex");
}

function buildSignedUrl(apiCallName: string, params: Record<string, string | number | boolean | undefined>): string {
  const { serverUrl, secret, algorithm } = getConfig();
  const query = buildQuery(params);
  const checksum = sign(apiCallName, query, secret, algorithm);
  return `${serverUrl}/api/${apiCallName}?${query}&checksum=${checksum}`;
}

/** A meetingID unique enough for one course's one session, never reused. */
export function generateMeetingId(courseId: string): string {
  return `kvbdtc-${courseId}-${randomBytes(6).toString("hex")}`;
}

export function generatePassword(): string {
  return randomBytes(9).toString("base64url");
}

// Creates the meeting on the BBB server ahead of time (idempotent — BBB
// itself no-ops a create call for a meetingID that's already running with
// the same parameters), so "Start" always has a real room waiting.
export async function createMeeting(params: {
  meetingId: string;
  title: string;
  moderatorPassword: string;
  attendeePassword: string;
  durationMinutes: number;
}): Promise<{ ok: boolean; message?: string }> {
  const url = buildSignedUrl("create", {
    name: params.title,
    meetingID: params.meetingId,
    attendeePW: params.attendeePassword,
    moderatorPW: params.moderatorPassword,
    duration: params.durationMinutes,
    record: false,
    welcome: `Welcome to ${params.title}.`,
  });
  const res = await fetch(url);
  const text = await res.text();
  const ok = /<returncode>SUCCESS<\/returncode>/i.test(text);
  const messageMatch = text.match(/<message>(.*?)<\/message>/i);
  return { ok, message: messageMatch?.[1] };
}

// The join URL is itself the redirect a browser follows straight into the
// session — nothing to fetch server-side, just build and sign it.
export function buildJoinUrl(params: { meetingId: string; fullName: string; password: string }): string {
  return buildSignedUrl("join", {
    meetingID: params.meetingId,
    fullName: params.fullName,
    password: params.password,
    redirect: true,
  });
}

export async function isMeetingRunning(meetingId: string): Promise<boolean> {
  const url = buildSignedUrl("isMeetingRunning", { meetingID: meetingId });
  const res = await fetch(url);
  const text = await res.text();
  return /<running>true<\/running>/i.test(text);
}

export async function endMeeting(meetingId: string, moderatorPassword: string): Promise<{ ok: boolean }> {
  const url = buildSignedUrl("end", { meetingID: meetingId, password: moderatorPassword });
  const res = await fetch(url);
  const text = await res.text();
  return { ok: /<returncode>SUCCESS<\/returncode>/i.test(text) };
}
