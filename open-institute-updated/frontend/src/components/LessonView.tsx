import { useState } from "react";
import { MarkdownLite } from "../lib/markdownLite";
import { embedUrl, isDirectVideo, LessonBlock, MediaInfo, ViewableLesson } from "../lib/lessonTypes";
import { useLowBandwidth } from "../lib/lowBandwidth";

// TP007 — plays / shows one piece of media: video and audio with native
// controls (seeking works because the server honours Range requests), images,
// PDFs inline, and everything else as a download.
// LMS025 — in low-bandwidth mode, video/PDF don't start loading until the
// student explicitly taps to load them (preload="none" plus a placeholder),
// instead of the browser eagerly fetching metadata for content the student
// may never even open.
export function MediaPlayer({ media, caption }: { media: MediaInfo; caption?: string }) {
  const lowBandwidth = useLowBandwidth();
  const [wantsLoad, setWantsLoad] = useState(!lowBandwidth);
  const heavy = media.kind === "video" || media.mimeType === "application/pdf";

  if (heavy && !wantsLoad) {
    return (
      <div className="space-y-2">
        <button
          type="button"
          onClick={() => setWantsLoad(true)}
          className="flex w-full flex-col items-center gap-2 rounded-sm border border-dashed border-line bg-paper py-8 text-sm text-ink/60 hover:border-navy hover:text-navy"
        >
          <span>Low-bandwidth mode — tap to load {media.kind === "video" ? "video" : "this PDF"}</span>
          <span className="text-xs text-ink/40">{media.name} · {Math.max(1, Math.round(media.sizeBytes / 1024))} KB</span>
        </button>
        {caption && <p className="text-xs text-ink/55">{caption}</p>}
      </div>
    );
  }

  return (
    <figure className="space-y-2">
      {media.kind === "video" && (
        <video controls preload="metadata" src={media.url} className="w-full rounded-sm bg-ink/90" />
      )}
      {media.kind === "audio" && <audio controls preload="metadata" src={media.url} className="w-full" />}
      {media.kind === "image" && <img src={media.url} alt={caption ?? media.name} className="max-h-[32rem] max-w-full rounded-sm border border-line" />}
      {media.mimeType === "application/pdf" && (
        <iframe src={media.url} title={media.name} className="h-[32rem] w-full rounded-sm border border-line" />
      )}
      {(media.kind === "document" || media.kind === "archive") && media.mimeType !== "application/pdf" && (
        <a href={media.url} download={media.name} className="btn-secondary">
          Download {media.name} ({Math.max(1, Math.round(media.sizeBytes / 1024))} KB)
        </a>
      )}
      {media.mimeType === "application/pdf" && (
        <a href={media.url} target="_blank" rel="noopener noreferrer" className="text-xs text-navy underline">Open PDF in a new tab</a>
      )}
      {caption && <figcaption className="text-xs text-ink/55">{caption}</figcaption>}
    </figure>
  );
}

function ExternalMedia({ url, kind, caption }: { url: string; kind: "video" | "audio" | "image" | "file"; caption?: string }) {
  const embed = kind === "video" ? embedUrl(url) : null;
  return (
    <figure className="space-y-2">
      {embed && (
        <iframe
          src={embed}
          title={caption ?? "Embedded video"}
          className="aspect-video w-full rounded-sm border border-line"
          sandbox="allow-scripts allow-same-origin allow-presentation"
          allow="fullscreen; picture-in-picture"
          referrerPolicy="strict-origin-when-cross-origin"
        />
      )}
      {!embed && kind === "video" && isDirectVideo(url) && <video controls preload="metadata" src={url} className="w-full rounded-sm bg-ink/90" />}
      {!embed && kind === "audio" && <audio controls preload="metadata" src={url} className="w-full" />}
      {kind === "image" && <img src={url} alt={caption ?? ""} className="max-h-[32rem] max-w-full rounded-sm border border-line" />}
      {!embed && !(kind === "video" && isDirectVideo(url)) && kind !== "audio" && kind !== "image" && (
        <a href={url} target="_blank" rel="noopener noreferrer" className="text-sm text-navy underline">{caption || url}</a>
      )}
      {caption && kind !== "file" && <figcaption className="text-xs text-ink/55">{caption}</figcaption>}
    </figure>
  );
}

const CALLOUT: Record<string, string> = {
  info: "border-navy/30 bg-navy/[0.05]",
  warning: "border-gold-dark/60 bg-gold/15",
  tip: "border-forest/40 bg-forest/10",
};

function Block({ block, mediaMap }: { block: LessonBlock; mediaMap: Record<string, MediaInfo> }) {
  switch (block.type) {
    case "heading":
      return block.level === 2 ? <h3 className="pt-2 font-display text-xl">{block.text}</h3> : <h4 className="pt-1 font-display text-base">{block.text}</h4>;
    case "text":
      return <MarkdownLite text={block.markdown} />;
    case "callout":
      return (
        <div className={`border-l-4 px-4 py-3 text-sm ${CALLOUT[block.tone] ?? CALLOUT.info}`}>
          <span className="font-medium capitalize">{block.tone === "warning" ? "Warning" : block.tone}: </span>
          {block.text}
        </div>
      );
    case "code":
      return <pre className="overflow-x-auto rounded-sm bg-ink p-4 font-mono text-xs text-paper"><code>{block.code}</code></pre>;
    case "link":
      return <a href={block.url} target="_blank" rel="noopener noreferrer" className="text-sm text-navy underline">{block.label}</a>;
    case "divider":
      return <hr className="border-line" />;
    case "image":
    case "video":
    case "audio":
    case "file": {
      const caption = block.type === "file" ? block.label : block.caption;
      const media = block.mediaAssetId ? mediaMap[block.mediaAssetId] : undefined;
      if (media) return <MediaPlayer media={media} caption={caption} />;
      if (block.url) return <ExternalMedia url={block.url} kind={block.type} caption={caption} />;
      return <p className="text-xs text-ink/45">[This {block.type} is no longer available.]</p>;
    }
  }
}

// One lesson as a student sees it. Used by the student course page and by the
// lesson builder's preview, so what a trainer previews is what students get.
export default function LessonView({ lesson }: { lesson: ViewableLesson }) {
  const mediaMap = lesson.mediaMap ?? {};
  const hasBlocks = !!lesson.blocks && lesson.blocks.length > 0;
  return (
    <div className="space-y-4">
      {lesson.media && <MediaPlayer media={lesson.media} />}
      {lesson.contentUrl && <ExternalMedia url={lesson.contentUrl} kind={lesson.contentType === "video" ? "video" : "file"} />}
      {hasBlocks
        ? lesson.blocks!.map((b) => <Block key={b.id} block={b} mediaMap={mediaMap} />)
        : lesson.contentBody && <MarkdownLite text={lesson.contentBody} />}
      {!lesson.media && !lesson.contentUrl && !hasBlocks && !lesson.contentBody && <p className="text-sm text-ink/45">This lesson has no content yet.</p>}
    </div>
  );
}
