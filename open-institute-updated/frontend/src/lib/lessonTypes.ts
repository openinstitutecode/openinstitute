// Shapes shared by the lesson builder (trainer) and the lesson viewer (student).
export type MediaInfo = { id: string; kind: string; mimeType: string; name: string; sizeBytes: number; url: string };

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

export type BlockType = LessonBlock["type"];

export type ViewableLesson = {
  title: string;
  contentType?: string;
  contentBody?: string | null;
  contentUrl?: string | null;
  blocks?: LessonBlock[] | null;
  media?: MediaInfo | null;
  mediaMap?: Record<string, MediaInfo>;
};

export function newBlock(type: BlockType): LessonBlock {
  const id = `b_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
  switch (type) {
    case "heading": return { id, type, level: 2, text: "" };
    case "text": return { id, type, markdown: "" };
    case "image": return { id, type, alt: "" };
    case "video": return { id, type };
    case "audio": return { id, type };
    case "file": return { id, type };
    case "callout": return { id, type, tone: "info", text: "" };
    case "code": return { id, type, language: "", code: "" };
    case "link": return { id, type, url: "", label: "" };
    case "divider": return { id, type };
  }
}

export function embedUrl(url: string): string | null {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    if (host === "youtu.be") return `https://www.youtube-nocookie.com/embed/${u.pathname.slice(1)}`;
    if (host === "youtube.com" || host === "m.youtube.com") {
      const v = u.searchParams.get("v");
      if (v) return `https://www.youtube-nocookie.com/embed/${v}`;
      if (u.pathname.startsWith("/embed/")) return `https://www.youtube-nocookie.com${u.pathname}`;
    }
    if (host === "vimeo.com" && /^\/\d+/.test(u.pathname)) return `https://player.vimeo.com/video${u.pathname.match(/^\/\d+/)![0]}`;
  } catch {
    /* not a URL */
  }
  return null;
}

export function isDirectVideo(url: string): boolean {
  return /\.(mp4|webm|ogv|mov|m4v)(\?|#|$)/i.test(url);
}
