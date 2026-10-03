// Batch 70 — the saved-report query, shared by GET /reports/:id/run and the scheduled-report job.
import { prisma } from "./prisma.js";

export async function runSavedReport(entity: string): Promise<unknown[]> {
  if (entity === "students") return prisma.student.findMany({ select: { fullName: true, studentNumber: true, academicStatus: true, programmeId: true }, take: 500 });
  if (entity === "finance") return prisma.invoice.findMany({ select: { id: true, amountDue: true, amountPaid: true, status: true, dueDate: true }, take: 500 });
  if (entity === "compliance") return prisma.complianceRequirement.findMany({ select: { regulator: true, category: true, requirement: true, status: true }, take: 500 });
  return prisma.researchProject.findMany({ select: { title: true, type: true, status: true }, take: 500 });
}
