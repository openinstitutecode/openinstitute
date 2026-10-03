// TP006/TP007 — turns stored Lesson rows into what a viewer is allowed to see:
//   * students never see drafts (isPublished = false);
//   * a lesson whose latest edit is still waiting for QA approval shows the
//     LAST APPROVED content, not the unreviewed edit (LMS037 — the schema
//     comment always promised this; the old PATCH overwrote the live row);
//   * uploaded media is resolved to short-lived signed URLs.
// Trainers/oversight staff see the live row exactly as saved.

import { prisma } from "./prisma.js";
import { collectMediaIds, type LessonBlock } from "./lesson-blocks.js";
import { mediaUrl } from "./signed-url.js";

export type MediaInfo = { id: string; kind: string; mimeType: string; name: string; sizeBytes: number; url: string };

type LessonLike = {
  id: string;
  isPublished: boolean;
  approvalStatus: string;
  contentBody: string | null;
  contentUrl: string | null;
  blocks: unknown;
  mediaAssetId: string | null;
  [k: string]: unknown;
};

export async function presentLessons<T extends LessonLike>(
  lessons: T[],
  opts: { forStaff: boolean }
): Promise<(T & { mediaMap: Record<string, MediaInfo>; media: MediaInfo | null })[]> {
  let visible = lessons;

  if (!opts.forStaff) {
    visible = lessons.filter((l) => l.isPublished);

    const pendingIds = visible.filter((l) => l.approvalStatus === "pending_review").map((l) => l.id);
    if (pendingIds.length > 0) {
      const snapshots = await prisma.lessonVersion.findMany({
        where: { lessonId: { in: pendingIds }, wasApproved: true },
        orderBy: { editedAt: "desc" },
      });
      const lastApproved = new Map<string, (typeof snapshots)[number]>();
      for (const s of snapshots) if (!lastApproved.has(s.lessonId)) lastApproved.set(s.lessonId, s);

      visible = visible.flatMap((l) => {
        if (l.approvalStatus !== "pending_review") return [l];
        const snap = lastApproved.get(l.id);
        // No approved snapshot exists → nothing approved to show yet, so hide it.
        if (!snap) return [];
        return [{ ...l, contentBody: snap.contentBody, contentUrl: snap.contentUrl, blocks: snap.blocks, mediaAssetId: snap.mediaAssetId }];
      });
    }
  }

  const wanted = new Set<string>();
  for (const l of visible) {
    if (l.mediaAssetId) wanted.add(l.mediaAssetId);
    for (const id of collectMediaIds(l.blocks as LessonBlock[] | null)) wanted.add(id);
  }
  const assets = wanted.size
    ? await prisma.mediaAsset.findMany({ where: { id: { in: [...wanted] } } })
    : [];
  const infoById = new Map<string, MediaInfo>(
    assets.map((a: { id: string; kind: string; mimeType: string; originalName: string; sizeBytes: number }) => [
      a.id,
      { id: a.id, kind: a.kind, mimeType: a.mimeType, name: a.originalName, sizeBytes: a.sizeBytes, url: mediaUrl(a.id) },
    ])
  );

  return visible.map((l) => {
    const mediaMap: Record<string, MediaInfo> = {};
    const ids = [...(l.mediaAssetId ? [l.mediaAssetId] : []), ...collectMediaIds(l.blocks as LessonBlock[] | null)];
    for (const id of ids) {
      const info = infoById.get(id);
      if (info) mediaMap[id] = info;
    }
    return { ...l, mediaMap, media: l.mediaAssetId ? mediaMap[l.mediaAssetId] ?? null : null };
  });
}
