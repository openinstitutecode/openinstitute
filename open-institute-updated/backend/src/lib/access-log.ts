// Batch 74 — KDATA-006: record who (staff) opened a student's record. Pure matcher + one Express middleware.
import type { NextFunction, Request, Response } from "express";
import { prisma } from "./prisma.js";

const RECORD_ROUTES = /^\/registry\/(academic-history|academic-standing|record-changes|enrollment-verification)\/([^/]+)\/?$/;
/** Returns what was viewed, or null when the request is not a student-record read. */
export function studentAccessTarget(method: string, path: string): { studentId: string; view: string } | null {
  if (method !== "GET") return null;
  const m = RECORD_ROUTES.exec(path.split("?")[0]);
  if (m) return { studentId: decodeURIComponent(m[2]), view: m[1] };
  if (/^\/students\/?$/.test(path.split("?")[0])) return { studentId: "list", view: "student-list" };
  return null;
}

export function auditStudentAccess(req: Request, res: Response, next: NextFunction) {
  const target = studentAccessTarget(req.method, req.path);
  if (!target) return next();
  res.on("finish", () => {
    const user = (req as Request & { user?: { id: string; role: string } }).user;
    if (res.statusCode !== 200 || !user || user.role === "STUDENT") return;
    prisma.auditLog.create({ data: { userId: user.id, action: "STUDENT_RECORD_VIEWED", entityType: "Student", entityId: target.studentId, metadata: { view: target.view } } })
      .catch(() => undefined); // logging must never break the request
  });
  next();
}

// KFEAT-052 — refunds above the configured limit need a senior approver. limit 0 = no limit.
export const canApproveAmount = (role: string, amount: number, limit: number) => limit <= 0 || amount <= limit || role === "SUPER_ADMIN" || role === "PRINCIPAL";
