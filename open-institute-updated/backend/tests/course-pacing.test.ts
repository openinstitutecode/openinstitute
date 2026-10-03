import test from "node:test";
import assert from "node:assert/strict";

import { distributeLessonsEvenly } from "../src/lib/course-pacing.js";

test("distributeLessonsEvenly returns one placeholder per week when there are no lessons", () => {
  const items = distributeLessonsEvenly([], 4);
  assert.equal(items.length, 4);
  assert.deepEqual(
    items.map((i) => i.weekNumber),
    [1, 2, 3, 4]
  );
  assert.ok(items.every((i) => i.lessonId === null));
});

test("distributeLessonsEvenly never drops or invents a lesson", () => {
  const lessons = Array.from({ length: 10 }, (_, i) => ({ id: `l${i}`, title: `Lesson ${i}` }));
  const items = distributeLessonsEvenly(lessons, 4);
  assert.equal(items.length, 10);
  const ids = items.map((i) => i.lessonId).sort();
  assert.deepEqual(ids, lessons.map((l) => l.id).sort());
});

test("distributeLessonsEvenly never assigns a week beyond totalWeeks", () => {
  const lessons = Array.from({ length: 7 }, (_, i) => ({ id: `l${i}`, title: `Lesson ${i}` }));
  const items = distributeLessonsEvenly(lessons, 3);
  assert.ok(items.every((i) => i.weekNumber >= 1 && i.weekNumber <= 3));
});

test("distributeLessonsEvenly keeps lessons in their original order within a week", () => {
  const lessons = [
    { id: "a", title: "A" },
    { id: "b", title: "B" },
    { id: "c", title: "C" },
  ];
  const items = distributeLessonsEvenly(lessons, 1);
  assert.deepEqual(items.map((i) => i.lessonId), ["a", "b", "c"]);
});

test("distributeLessonsEvenly rejects a non-positive totalWeeks rather than silently misbehaving", () => {
  assert.throws(() => distributeLessonsEvenly([{ id: "a", title: "A" }], 0));
});
