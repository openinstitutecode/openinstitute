import { test } from "node:test";
import assert from "node:assert/strict";
import { coursesRouter } from "../src/routes/courses.js";
import { contentRouter } from "../src/routes/content.js";
import { quizzesRouter } from "../src/routes/quizzes.js";
import { assignmentsV2Router } from "../src/routes/assignments-v2.js";

function registeredRoutes(router: { stack: Array<{ route?: { path: string; methods: Record<string, boolean> } }> }) {
  return router.stack
    .filter((layer) => layer.route)
    .flatMap((layer) => Object.entries(layer.route!.methods)
      .filter(([, enabled]) => enabled)
      .map(([method]) => `${method.toUpperCase()} ${layer.route!.path}`));
}

test("course and registrar workflows expose trainer assignment and course-note CRUD", () => {
  const routes = registeredRoutes(coursesRouter);
  assert.ok(routes.includes("PATCH /:id/trainer"));
  assert.ok(routes.includes("POST /:courseId/announcements"));
  assert.ok(routes.includes("GET /:courseId/announcements"));
  assert.ok(routes.includes("PATCH /:courseId/announcements/:announcementId"));
  assert.ok(routes.includes("DELETE /:courseId/announcements/:announcementId"));
});

test("trainer authoring APIs expose lesson, quiz and assignment publishing controls", () => {
  assert.ok(registeredRoutes(contentRouter).includes("POST /lessons"));
  assert.ok(registeredRoutes(contentRouter).includes("PATCH /lessons/:id"));
  assert.ok(registeredRoutes(contentRouter).includes("DELETE /lessons/:id"));

  assert.ok(registeredRoutes(quizzesRouter).includes("POST /"));
  assert.ok(registeredRoutes(quizzesRouter).includes("POST /:id/publish"));
  assert.ok(registeredRoutes(quizzesRouter).includes("POST /:id/unpublish"));
  assert.ok(registeredRoutes(quizzesRouter).includes("DELETE /:id"));

  assert.ok(registeredRoutes(assignmentsV2Router).includes("POST /"));
  assert.ok(registeredRoutes(assignmentsV2Router).includes("POST /:id/publish"));
  assert.ok(registeredRoutes(assignmentsV2Router).includes("PATCH /:id"));
});
