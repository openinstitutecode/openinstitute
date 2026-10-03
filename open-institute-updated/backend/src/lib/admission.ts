import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { Prisma } from "@prisma/client";
import { resolveStoragePath } from "./media-storage.js";

const REQUIRED_ADMISSION_DOCUMENTS = ["id_document", "certificate", "portrait_photo"];

export function missingRequiredAdmissionDocuments(documents: Array<{ category: string; verified: boolean }>) {
  return REQUIRED_ADMISSION_DOCUMENTS.filter(
    (category) => !documents.some((document) => document.category === category && document.verified)
  );
}

export async function admitApplication(tx: Prisma.TransactionClient, applicationId: string, reviewedById?: string) {
  const application = await tx.application.findUnique({
    where: { id: applicationId },
    include: { documents: true },
  });
  if (!application) throw new Error("APPLICATION_NOT_FOUND");
  const missing = missingRequiredAdmissionDocuments(application.documents);
  if (missing.length) throw new Error(`ADMISSION_DOCUMENTS_REQUIRED:${missing.join(",")}`);
  if (application.documents.some((document) => !document.verified)) throw new Error("ADMISSION_DOCUMENTS_UNVERIFIED");

  const existingStudent = await tx.student.findUnique({ where: { applicationId } });
  if (existingStudent) return { student: existingStudent, created: false };
  if (!application.temporaryPasswordHash) throw new Error("TEMPORARY_PASSWORD_REQUIRED");
  if (await tx.user.findFirst({ where: { email: { equals: application.email, mode: "insensitive" } }, select: { id: true } })) {
    throw new Error("EMAIL_ALREADY_IN_USE");
  }
  if (await tx.user.findFirst({ where: { phone: application.phone }, select: { id: true } })) throw new Error("PHONE_ALREADY_IN_USE");

  let studentSeq = await tx.idSequence.upsert({
    where: { name: "student" },
    create: { name: "student", value: 1 },
    update: { value: { increment: 1 } },
  });
  const year = new Date().getFullYear();
  let studentNumber: string;
  let admissionNumber: string;
  while (true) {
    studentNumber = `STU-${year}-${String(studentSeq.value).padStart(6, "0")}`;
    admissionNumber = `ADM-${year}-${String(studentSeq.value).padStart(6, "0")}`;
    const [existingStudentNumber, existingAdmissionNumber] = await Promise.all([
      tx.student.findUnique({ where: { studentNumber }, select: { id: true } }),
      tx.student.findUnique({ where: { admissionNumber }, select: { id: true } }),
    ]);
    if (!existingStudentNumber && !existingAdmissionNumber) break;
    studentSeq = await tx.idSequence.upsert({
      where: { name: "student" },
      create: { name: "student", value: 1 },
      update: { value: { increment: 1 } },
    });
  }
  const cardId = `DID-${randomBytes(9).toString("hex").toUpperCase()}`;
  const user = await tx.user.create({
    data: {
      email: application.email,
      phone: application.phone,
      passwordHash: application.temporaryPasswordHash,
      role: "STUDENT",
      isActive: true,
      mustChangePassword: true,
    },
  });
  const photoDocument = application.documents.find((document) => document.category === "portrait_photo");
  const photoPath = photoDocument?.storageKey ? resolveStoragePath(photoDocument.storageKey) : null;
  const photoBytes = photoPath ? await readFile(photoPath) : null;
  const photoDataUrl = photoBytes && photoDocument?.mimeType
    ? `data:${photoDocument.mimeType};base64,${photoBytes.toString("base64")}`
    : photoDocument?.fileUrl;
  const student = await tx.student.create({
    data: {
      userId: user.id,
      applicationId,
      studentNumber,
      admissionNumber,
      cardId,
      fullName: application.fullName,
      programmeId: application.programmeId,
      intake: String(year),
      studyMode: application.studyMode,
      photoDataUrl,
    },
  });
  await tx.application.update({
    where: { id: applicationId },
    data: { status: "ADMITTED", reviewedById, temporaryPasswordHash: null },
  });
  if (reviewedById) {
    await tx.auditLog.create({
      data: { userId: reviewedById, action: "APPLICATION_ADMITTED", entityType: "Application", entityId: applicationId, metadata: { studentNumber } },
    });
  }
  return { student, created: true };
}
