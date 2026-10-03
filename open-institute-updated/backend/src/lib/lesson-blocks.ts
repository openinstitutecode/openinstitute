// TP006 — the block model behind the visual lesson builder.
//
// A lesson's body is an ordered list of typed blocks. The builder edits this
// list; students see it rendered by the shared LessonView component. This
// module is the single source of truth for what a valid block is, so the API
// (content.ts) and anything else that needs to read blocks agree on it.
//
// `blocksToMarkdown` derives a plain-text/markdown version that is always
// written to Lesson.contentBody, so everything that already reads contentBody
// (AI tutor grounding, older screens, exports) keeps working without knowing
// blocks exist.

import { z } from "zod";

export function isHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

const id = z.string().min(1).max(64);
const url = z.string().max(2048).refine(isHttpUrl, "Must be an http(s) URL.");
const caption = z.string().max(300).optional();

const headingBlock = z.object({ id, type: z.literal("heading"), level: z.union([z.literal(2), z.literal(3)]).default(2), text: z.string().min(1).max(200) });
const textBlock = z.object({ id, type: z.literal("text"), markdown: z.string().max(20000) });
const imageBlock = z.object({ id, type: z.literal("image"), mediaAssetId: z.string().optional(), url: url.optional(), alt: z.string().max(300).default(""), caption });
const videoBlock = z.object({ id, type: z.literal("video"), mediaAssetId: z.string().optional(), url: url.optional(), caption });
const audioBlock = z.object({ id, type: z.literal("audio"), mediaAssetId: z.string().optional(), url: url.optional(), caption });
const fileBlock = z.object({ id, type: z.literal("file"), mediaAssetId: z.string().optional(), url: url.optional(), label: z.string().max(200).optional() });
const calloutBlock = z.object({ id, type: z.literal("callout"), tone: z.enum(["info", "warning", "tip"]).default("info"), text: z.string().min(1).max(2000) });
const codeBlock = z.object({ id, type: z.literal("code"), language: z.string().max(30).optional(), code: z.string().max(10000) });
const linkBlock = z.object({ id, type: z.literal("link"), url, label: z.string().min(1).max(200) });
const dividerBlock = z.object({ id, type: z.literal("divider") });

export const blockSchema = z.discriminatedUnion("type", [
  headingBlock,
  textBlock,
  imageBlock,
  videoBlock,
  audioBlock,
  fileBlock,
  calloutBlock,
  codeBlock,
  linkBlock,
  dividerBlock,
]);

export const MAX_BLOCKS = 200;
export const blocksSchema = z.array(blockSchema).max(MAX_BLOCKS);

export type LessonBlock =
  | { id: string; type: "heading"; level: 2 | 3; text: string }
  | { id: string; type: "text"; markdown: string }
  | { id: string; type: "image"; mediaAssetId?: string; url?: string; alt: string; caption?: string }
  | { id: string; type: "video"; mediaAssetId?: string; url?: string; caption?: string }
  | { id: string; type: "audio"; mediaAssetId?: string; url?: string; caption?: string }
  | { id: string; type: "file"; mediaAssetId?: string; url?: string; label?: string }
  | { id: string; type: "callout"; tone: "info" | "warning" | "tip"; text: string }
  | { id: string; type: "code"; language?: string; code: string }
  | { id: string; type: "link"; url: string; label: string }
  | { id: string; type: "divider" };

/** Cross-field rules a per-block zod object can't express. Returns a message, or null when valid. */
export function checkBlockRefs(blocks: LessonBlock[]): string | null {
  const seen = new Set<string>();
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (seen.has(b.id)) return `Block ${i + 1} reuses id "${b.id}" — block ids must be unique.`;
    seen.add(b.id);
    if ((b.type === "image" || b.type === "video" || b.type === "audio" || b.type === "file") && !b.mediaAssetId && !b.url) {
      return `Block ${i + 1} (${b.type}) needs an uploaded file or a URL.`;
    }
  }
  return null;
}

export function collectMediaIds(blocks: LessonBlock[] | null | undefined): string[] {
  if (!blocks) return [];
  const ids = new Set<string>();
  for (const b of blocks) {
    if ((b.type === "image" || b.type === "video" || b.type === "audio" || b.type === "file") && b.mediaAssetId) {
      ids.add(b.mediaAssetId);
    }
  }
  return [...ids];
}

/** Plain markdown for Lesson.contentBody. Media is described in words, since bytes can't live in text. */
export function blocksToMarkdown(blocks: LessonBlock[]): string {
  const out: string[] = [];
  for (const b of blocks) {
    switch (b.type) {
      case "heading":
        out.push(`${"#".repeat(b.level)} ${b.text}`);
        break;
      case "text":
        out.push(b.markdown.trim());
        break;
      case "image":
        out.push(`[Image: ${b.alt || b.caption || "illustration"}]`);
        break;
      case "video":
        out.push(`[Video${b.caption ? `: ${b.caption}` : ""}]${b.url ? ` ${b.url}` : ""}`);
        break;
      case "audio":
        out.push(`[Audio${b.caption ? `: ${b.caption}` : ""}]${b.url ? ` ${b.url}` : ""}`);
        break;
      case "file":
        out.push(`[Attachment: ${b.label || "file"}]${b.url ? ` ${b.url}` : ""}`);
        break;
      case "callout":
        out.push(`> **${b.tone === "warning" ? "Warning" : b.tone === "tip" ? "Tip" : "Note"}:** ${b.text}`);
        break;
      case "code":
        out.push("```" + (b.language ?? "") + "\n" + b.code + "\n```");
        break;
      case "link":
        out.push(`[${b.label}](${b.url})`);
        break;
      case "divider":
        out.push("---");
        break;
    }
  }
  return out.filter((s) => s.length > 0).join("\n\n");
}

const WORDS_PER_MINUTE = 200;
const MEDIA_MINUTES: Record<string, number> = { video: 5, audio: 3, image: 0, file: 0 };

/** Rough study-time estimate (minutes, ≥1) so the builder can suggest a duration. */
export function estimateMinutes(blocks: LessonBlock[]): number {
  let words = 0;
  let extra = 0;
  for (const b of blocks) {
    if (b.type === "text") words += b.markdown.split(/\s+/).filter(Boolean).length;
    else if (b.type === "heading") words += b.text.split(/\s+/).filter(Boolean).length;
    else if (b.type === "callout") words += b.text.split(/\s+/).filter(Boolean).length;
    else if (b.type in MEDIA_MINUTES) extra += MEDIA_MINUTES[b.type];
  }
  return Math.max(1, Math.ceil(words / WORDS_PER_MINUTE) + extra);
}
