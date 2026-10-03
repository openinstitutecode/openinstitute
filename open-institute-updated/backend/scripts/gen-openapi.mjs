// KAPI-001/002/003 — writes docs/openapi.json from the static route inventory. Paths, methods, auth requirement and the shared
// error body are exact; request/response schemas are NOT inferred (marked as generic objects) — refine per route over time.
import { writeFileSync } from "node:fs";
import { inventory } from "./route-inventory.mjs";
const PUBLIC = /^(POST \/api\/(applications|complaints|rpl\/apply|auth\/(login|forgot-password|reset-password)|finance\/mpesa\/callback)|GET \/api\/(compliance\/public-status|credentials\/verify|employers\/postings|exams\/admit-cards\/verify|media\/file|programmes|scorm\/content|settings\/public|notices\/active))/;
const paths = {};
for (const r of inventory().filter((r) => r.path.startsWith("/api"))) {
  const p = r.path.replace(/:(\w+)/g, "{$1}").replace(/\/\*$/, "/{file}");
  const op = `${r.method} ${r.path}`;
  const open = r.guard === "signed/token" || (r.guard === "NONE" && PUBLIC.test(op));
  const params = [...p.matchAll(/\{(\w+)\}/g)].map((m) => ({ name: m[1], in: "path", required: true, schema: { type: "string" } }));
  (paths[p] ??= {})[r.method.toLowerCase()] = {
    tags: [p.split("/")[2] ?? "root"],
    summary: `${r.method} ${p}`,
    "x-guard": r.guard,
    "x-source": `backend/src/routes/${r.file}`,
    ...(params.length ? { parameters: params } : {}),
    ...(open ? { security: [] } : { security: [{ bearerAuth: [] }] }),
    ...(["POST", "PUT", "PATCH"].includes(r.method) ? { requestBody: { content: { "application/json": { schema: { type: "object" } } } } } : {}),
    responses: { "200": { description: "Success", content: { "application/json": { schema: { type: "object" } } } }, "400": { $ref: "#/components/responses/Error" }, ...(open ? {} : { "401": { $ref: "#/components/responses/Error" } }), ...(r.guard === "role" ? { "403": { $ref: "#/components/responses/Error" } } : {}), "404": { $ref: "#/components/responses/Error" } },
  };
}
const doc = {
  openapi: "3.0.3",
  info: { title: "Measur Business College Portal API", version: "batch-69", description: "Generated from source by backend/scripts/gen-openapi.mjs. Auth: `Authorization: Bearer <JWT>` from POST /api/auth/login. Errors share one body (ErrorBody);" },
  servers: [{ url: "/" }],
  paths,
  components: {
    securitySchemes: { bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" } },
    schemas: { ErrorBody: { type: "object", required: ["message"], properties: { message: { type: "string" }, code: { type: "string", example: "NOT_FOUND" }, requestId: { type: "string" }, details: {} } } },
    responses: { Error: { description: "Error", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorBody" } } } } },
  },
};
const out = new URL("../../docs/openapi.json", import.meta.url).pathname;
writeFileSync(out, JSON.stringify(doc, null, 1));
console.log(`wrote ${out}: ${Object.keys(paths).length} paths, ${Object.values(paths).reduce((a, m) => a + Object.keys(m).length, 0)} operations`);
