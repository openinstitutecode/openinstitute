import { test } from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import type { Prisma } from "@prisma/client";
import { JWT_SECRET, requireAuth, type AuthedRequest } from "../src/middleware/auth.js";
import type { Response } from "express";
import { applicationsRouter } from "../src/routes/applications.js";
import { admitApplication, missingRequiredAdmissionDocuments } from "../src/lib/admission.js";
import { admissionMagicMatches, classifyAdmissionUpload, maxAdmissionUploadBytes } from "../src/lib/admission-files.js";
import { roleAllowedForScope } from "../src/middleware/role-scope.js";

test("admission requires verified ID, qualification and portrait photo", () => {
  assert.deepEqual(missingRequiredAdmissionDocuments([]), ["id_document", "certificate", "portrait_photo"]);
  assert.deepEqual(missingRequiredAdmissionDocuments([
    { category: "id_document", verified: true },
    { category: "certificate", verified: true },
    { category: "portrait_photo", verified: false },
  ]), ["portrait_photo"]);
  assert.deepEqual(missingRequiredAdmissionDocuments([
    { category: "id_document", verified: true },
    { category: "certificate", verified: true },
    { category: "portrait_photo", verified: true },
  ]), []);
});

test("admission file allow-list enforces supported category, type, extension signature and size", () => {
  assert.equal(classifyAdmissionUpload("application/pdf", "id_document").ok, true);
  assert.equal(classifyAdmissionUpload("image/png", "certificate").ok, true);
  assert.equal(classifyAdmissionUpload("image/jpeg", "portrait_photo").ok, true);
  assert.equal(classifyAdmissionUpload("application/pdf", "portrait_photo").ok, false);
  assert.equal(classifyAdmissionUpload("image/svg+xml", "id_document").ok, false);
  assert.equal(admissionMagicMatches("application/pdf", "certificate.pdf", Buffer.from("%PDF-1.7")), true);
  assert.equal(admissionMagicMatches("image/png", "portrait.png", Buffer.from("%PDF-1.7")), false);
  assert.equal(maxAdmissionUploadBytes("portrait_photo"), 5 * 1024 * 1024);
  assert.equal(maxAdmissionUploadBytes("id_document"), 10 * 1024 * 1024);
});

test("admission upload and private document-serving endpoints are registered at router scope", () => {
  const routes = applicationsRouter.stack
    .filter((layer: any) => layer.route)
    .map((layer: any) => `${Object.keys(layer.route.methods).join(",").toUpperCase()} ${layer.route.path}`);
  assert.ok(routes.includes("POST /:refNumber/files"));
  assert.ok(routes.includes("GET /files/:documentId"));
  assert.ok(routes.includes("PATCH /:id/documents/:docId/verify"));
});

test("successful verification activates a student account and issues student and digital IDs once", async () => {
  const operations: Array<[string, any]> = [];
  const application = {
    id: "app-1", email: "learner@example.edu", phone: "0712345678", fullName: "A Learner",
    programmeId: "programme-1", studyMode: "online", temporaryPasswordHash: "$2a$12$hash",
    documents: [
      { category: "id_document", verified: true },
      { category: "certificate", verified: true },
      { category: "portrait_photo", verified: true, fileUrl: "https://files.example/photo.png" },
    ],
  };
  const tx = {
    application: {
      findUnique: async () => application,
      update: async (args: unknown) => { operations.push(["application.update", args]); return args; },
    },
    student: {
      findUnique: async () => null,
      create: async (args: unknown) => { operations.push(["student.create", args]); return { studentNumber: "STU-2026-000009", cardId: "DID-UNIQUE" }; },
    },
    user: {
      findFirst: async () => null,
      create: async (args: unknown) => { operations.push(["user.create", args]); return { id: "user-1" }; },
    },
    idSequence: { upsert: async () => ({ value: 9 }) },
  } as unknown as Prisma.TransactionClient;

  const result = await admitApplication(tx, "app-1");
  assert.equal(result.created, true);
  assert.equal(result.student.studentNumber, "STU-2026-000009");
  assert.equal(operations.find(([name]) => name === "user.create")?.[1].data.role, "STUDENT");
  assert.equal(operations.find(([name]) => name === "user.create")?.[1].data.isActive, true);
  assert.equal(operations.find(([name]) => name === "user.create")?.[1].data.mustChangePassword, true);
  assert.equal(operations.find(([name]) => name === "user.create")?.[1].data.passwordHash, "$2a$12$hash");
  assert.equal(operations.find(([name]) => name === "student.create")?.[1].data.cardId.startsWith("DID-"), true);
  assert.equal(operations.find(([name]) => name === "application.update")?.[1].data.status, "ADMITTED");
});

test("department scope denies trainers from administration, finance and admissions", () => {
  assert.equal(roleAllowedForScope("TRAINER", "/applications"), false);
  assert.equal(roleAllowedForScope("TRAINER", "/finance/invoices"), false);
  assert.equal(roleAllowedForScope("TRAINER", "/staff"), false);
  assert.equal(roleAllowedForScope("FINANCE_OFFICER", "/applications/app-1/decision"), false);
  assert.equal(roleAllowedForScope("ADMISSIONS_OFFICER", "/finance"), false);
  assert.equal(roleAllowedForScope("STUDENT", "/applications/app-1/decision"), false);
  assert.equal(roleAllowedForScope("STUDENT", "/applications/files/doc-1"), true);
  assert.equal(roleAllowedForScope("REGISTRAR", "/applications"), true);
  assert.equal(roleAllowedForScope("SUPER_ADMIN", "/finance"), true);
});

test("temporary-password sessions can only access the password-change endpoint", () => {
  const token = jwt.sign({ sub: "user-1", role: "STUDENT", email: "learner@example.edu", mustChangePassword: true }, JWT_SECRET);
  let statusCode = 200;
  let calledNext = false;
  const req = { path: "/finance", headers: { authorization: `Bearer ${token}` } } as unknown as AuthedRequest;
  const res = {
    status(code: number) { statusCode = code; return this; },
    json() { return this; },
  } as unknown as Response;
  requireAuth(req, res, () => { calledNext = true; });
  assert.equal(statusCode, 403);
  assert.equal(calledNext, false);

  req.path = "/change-password";
  statusCode = 200;
  requireAuth(req, res, () => { calledNext = true; });
  assert.equal(statusCode, 200);
  assert.equal(calledNext, true);
});
