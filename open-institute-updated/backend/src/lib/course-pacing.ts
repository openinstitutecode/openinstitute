// AI014 — deterministic fallback pacing distribution, batch 64. Kept
// dependency-free (no prisma, no express) so it can be unit-tested on its
// own, same discipline as lib/chunking.ts and lib/embeddings.ts. Used by
// routes/course-delivery.ts whenever no AI model is configured, or the
// model's response can't be parsed as the expected structure — this never
// returns an empty plan, and never invents a lesson that isn't in the
// input list.
export type PacingItem = { weekNumber: number; lessonId: string | null; title: string; objective: string };

export function distributeLessonsEvenly(
  lessons: { id: string; title: string }[],
  totalWeeks: number
): PacingItem[] {
  if (totalWeeks < 1) throw new Error("totalWeeks must be at least 1.");
  if (lessons.length === 0) {
    return Array.from({ length: totalWeeks }, (_, i) => ({
      weekNumber: i + 1,
      lessonId: null,
      title: `Week ${i + 1}`,
      objective: "No lessons exist for this course yet — add content, then regenerate the plan.",
    }));
  }
  const perWeek = Math.max(1, Math.ceil(lessons.length / totalWeeks));
  const items: PacingItem[] = [];
  lessons.forEach((lesson, idx) => {
    const week = Math.min(totalWeeks, Math.floor(idx / perWeek) + 1);
    items.push({ weekNumber: week, lessonId: lesson.id, title: lesson.title, objective: `Cover: ${lesson.title}` });
  });
  return items;
}
