// Pure helpers for reordering a course outline (modules → lessons). Used by
// the lesson builder's drag-and-drop and its up/down buttons.

export type OutlineNode<L extends { id: string }> = { id: string; lessons: L[] };

export function moveLesson<L extends { id: string }, M extends OutlineNode<L>>(
  modules: M[],
  lessonId: string,
  toModuleId: string,
  beforeLessonId: string | null
): M[] {
  let moving: L | undefined;
  const without = modules.map((m) => {
    const found = m.lessons.find((l) => l.id === lessonId);
    if (found) moving = found;
    return { ...m, lessons: m.lessons.filter((l) => l.id !== lessonId) };
  });
  if (!moving) return modules;
  const lesson = moving;
  return without.map((m) => {
    if (m.id !== toModuleId) return m;
    const idx = beforeLessonId ? m.lessons.findIndex((l) => l.id === beforeLessonId) : -1;
    const lessons = m.lessons.slice();
    lessons.splice(idx === -1 ? lessons.length : idx, 0, lesson);
    return { ...m, lessons };
  });
}

export function moveModule<M extends { id: string }>(modules: M[], moduleId: string, beforeModuleId: string | null): M[] {
  const moving = modules.find((m) => m.id === moduleId);
  if (!moving) return modules;
  const rest = modules.filter((m) => m.id !== moduleId);
  const idx = beforeModuleId ? rest.findIndex((m) => m.id === beforeModuleId) : -1;
  rest.splice(idx === -1 ? rest.length : idx, 0, moving);
  return rest;
}

/** One step up/down inside the lesson's own module. Returns the same array when already at the edge. */
export function nudgeLesson<L extends { id: string }, M extends OutlineNode<L>>(modules: M[], lessonId: string, dir: -1 | 1): M[] {
  const mod = modules.find((m) => m.lessons.some((l) => l.id === lessonId));
  if (!mod) return modules;
  const i = mod.lessons.findIndex((l) => l.id === lessonId);
  const j = i + dir;
  if (j < 0 || j >= mod.lessons.length) return modules;
  // moving down = insert before the lesson two places on (or at the end)
  const before = dir === -1 ? mod.lessons[j].id : mod.lessons[j + 1]?.id ?? null;
  return moveLesson(modules, lessonId, mod.id, before);
}

export function structurePayload<L extends { id: string }, M extends OutlineNode<L>>(modules: M[]) {
  return { modules: modules.map((m) => ({ id: m.id, lessonIds: m.lessons.map((l) => l.id) })) };
}
