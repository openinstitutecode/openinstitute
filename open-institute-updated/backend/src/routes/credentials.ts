import { resolvePseudonymSecret } from "../lib/pseudonym-secret.js";
import { pseudonymise } from "../lib/quickwins.js";
import { JWT_SECRET } from "../middleware/auth.js";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireRole, AuthedRequest } from "../middleware/auth.js";
import { signDocument, verifyDocument, generateDocumentId } from "../lib/credentials.js";

export const credentialsRouter = Router();

// Registrar issues an official transcript for a student. This locks in the
// current grade set into a signed document — later grade edits don't alter
// an already-issued transcript. Blocked if the student has an active
// financial hold (FN018) — previously a TODO comment with no actual
// enforcement; now checked for real before every issuance.
async function getActiveHold(studentId: string) {
  return prisma.financialHold.findFirst({ where: { studentId, releasedAt: null } });
}

credentialsRouter.post(
  "/transcripts/:studentId",
  requireAuth,
  requireRole("REGISTRAR", "EXAMINATION_OFFICER", "SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    const activeHold = await getActiveHold(req.params.studentId);
    if (activeHold) {
      return res.status(409).json({ message: `Cannot issue: active financial hold — ${activeHold.reason}` });
    }

    const student = await prisma.student.findUnique({
      where: { id: req.params.studentId },
      include: {
        enrollments: { include: { unit: true } },
        programme: true,
      },
    });
    if (!student) return res.status(404).json({ message: "Student not found." });

    const documentId = generateDocumentId("TRX");
    const payload = {
      documentId,
      studentNumber: student.studentNumber,
      fullName: student.fullName,
      programme: student.programme.name,
      units: student.enrollments.map((e) => ({
        code: e.unit.code,
        title: e.unit.title,
        grade: e.finalGrade,
        semester: e.semester,
      })),
      issuedAt: new Date().toISOString(),
    };
    const signedHash = signDocument(payload);
    const verificationUrl = `${process.env.PUBLIC_BASE_URL ?? "https://kvbdtc.ac.ke"}/verify/${documentId}`;

    const transcript = await prisma.transcript.create({
      data: {
        studentId: student.id,
        documentId,
        verificationUrl,
        signedHash,
        payload: JSON.stringify(payload), // the exact text that signedHash covers
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        action: "TRANSCRIPT_ISSUED",
        entityType: "Transcript",
        entityId: transcript.id,
      },
    });

    res.status(201).json({ ...transcript, payload });
  }
);

credentialsRouter.post(
  "/certificates/:studentId",
  requireAuth,
  requireRole("REGISTRAR", "SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    const activeHold = await getActiveHold(req.params.studentId);
    if (activeHold) {
      return res.status(409).json({ message: `Cannot issue: active financial hold — ${activeHold.reason}` });
    }

    const student = await prisma.student.findUnique({
      where: { id: req.params.studentId },
      include: { programme: true },
    });
    if (!student) return res.status(404).json({ message: "Student not found." });
    if (student.academicStatus !== "GRADUATED") {
      return res.status(400).json({ message: "Student has not been marked as graduated yet." });
    }

    const documentId = generateDocumentId("CERT");
    const payload = {
      documentId,
      studentNumber: student.studentNumber,
      fullName: student.fullName,
      qualification: student.programme.qualificationLevel,
      programme: student.programme.name,
      issuedAt: new Date().toISOString(),
    };
    const signedHash = signDocument(payload);
    const verificationUrl = `${process.env.PUBLIC_BASE_URL ?? "https://kvbdtc.ac.ke"}/verify/${documentId}`;

    const certificate = await prisma.certificate.create({
      data: {
        studentId: student.id,
        qualification: student.programme.qualificationLevel,
        documentId,
        verificationUrl,
        signedHash,
      },
    });

    res.status(201).json({ ...certificate, payload });
  }
);

// Public: anyone with a document ID (e.g. an employer) can verify a
// credential without authenticating. Only non-sensitive fields are exposed.
async function logVerification(documentId: string, ip: string | undefined, found: boolean, revoked: boolean) {
  try {
    const { secret } = resolvePseudonymSecret(process.env, JWT_SECRET);
    await prisma.credentialVerification.create({ data: { documentId: documentId.slice(0, 80), found, revoked, ipHash: ip && secret ? pseudonymise(ip, secret) : null } });
  } catch { /* logging must never break public verification */ }
}

credentialsRouter.get("/verify/:documentId", async (req, res) => {
  const { documentId } = req.params;

  const transcript = await prisma.transcript.findUnique({
    where: { documentId },
    include: { student: { include: { programme: true } } },
  });
  const certificate = !transcript
    ? await prisma.certificate.findUnique({
        where: { documentId },
        include: { student: true },
      })
    : null;
  const letter = !transcript && !certificate
    ? await prisma.generatedLetter.findUnique({
        where: { documentId },
        include: { student: true },
      })
    : null;

  const record = transcript ?? certificate ?? letter;
  await logVerification(documentId, req.ip, !!record, !!record?.revoked); // KFEAT-125 — best effort
  if (!record) {
    return res.status(404).json({ valid: false, message: "No document found with that ID." });
  }

  res.json({
    valid: true,
    revoked: record.revoked,
    revokedReason: record.revoked ? record.revokedReason : undefined,
    documentId,
    type: transcript ? "transcript" : certificate ? "certificate" : "letter",
    studentName: record.student.fullName,
    programme: transcript ? transcript.student.programme.name : certificate ? certificate.qualification : (letter as NonNullable<typeof letter>).type,
    issuedAt: record.issuedAt,
  });
});

// SP009/SP010 — digital student ID. Reuses the same signing primitive as
// transcripts/certificates. Public verification exposes only status-level
// information, never personal contact details.
credentialsRouter.get("/student-id/mine", requireAuth, async (req: AuthedRequest, res) => {
  const student = await prisma.student.findUnique({
    where: { userId: req.user!.id },
    include: { programme: true },
  });
  if (!student) return res.status(404).json({ message: "No student record for this account." });

  const payload = {
    studentNumber: student.studentNumber,
    fullName: student.fullName,
    programme: student.programme.name,
    academicStatus: student.academicStatus,
  };
  const signedHash = signDocument(payload);
  const verificationUrl = `${process.env.PUBLIC_BASE_URL ?? "https://kvbdtc.ac.ke"}/verify-student/${student.studentNumber}`;

  res.json({ ...payload, verificationUrl, signedHash });
});

// Public — an employer or verifier checks a student number and gets only
// enrollment status back, never contact info or grades.
credentialsRouter.get("/verify-student/:studentNumber", async (req, res) => {
  const student = await prisma.student.findUnique({
    where: { studentNumber: req.params.studentNumber },
    include: { programme: true },
  });
  if (!student) return res.status(404).json({ valid: false, message: "No student found with that number." });

  res.json({
    valid: true,
    studentNumber: student.studentNumber,
    programme: student.programme.name,
    academicStatus: student.academicStatus,
  });
});

// RG021 — transcript version control: every re-issue is a new, separate
// row rather than an overwrite, so a superseded transcript's exact content
// stays inspectable. This lists them in issue order, newest first.
credentialsRouter.get(
  "/transcripts/:studentId/history",
  requireAuth,
  requireRole("REGISTRAR", "EXAMINATION_OFFICER", "SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    const transcripts = await prisma.transcript.findMany({
      where: { studentId: req.params.studentId },
      orderBy: { issuedAt: "asc" },
    });
    res.json(
      transcripts.map((t, i) => ({ ...t, version: i + 1, current: i === transcripts.length - 1 }))
    );
  }
);

// Printable transcript — a student lists their own issued transcripts here (registrar-issued; a student
// cannot issue one themselves, and issuance is still blocked by an active financial hold).
credentialsRouter.get("/transcripts/mine", requireAuth, async (req: AuthedRequest, res) => {
  const student = await prisma.student.findUnique({ where: { userId: req.user!.id } });
  if (!student) return res.status(404).json({ message: "No student record for this account." });
  const rows = await prisma.transcript.findMany({ where: { studentId: student.id }, orderBy: { issuedAt: "asc" } });
  res.json(
    rows
      .map((t, i) => ({
        id: t.id,
        documentId: t.documentId,
        issuedAt: t.issuedAt,
        revoked: t.revoked,
        printable: t.payload !== null,
        version: i + 1,
        current: i === rows.length - 1,
      }))
      .reverse()
  );
});

// One issued transcript's full content for display/printing. Allowed for the student it belongs to and for
// registry staff only. The signature is re-checked on every read, so a tampered row is reported, not printed as valid.
credentialsRouter.get("/transcripts/doc/:documentId", requireAuth, async (req: AuthedRequest, res) => {
  const t = await prisma.transcript.findUnique({
    where: { documentId: req.params.documentId },
    include: { student: { include: { programme: true } } },
  });
  const staff = ["REGISTRAR", "EXAMINATION_OFFICER", "SUPER_ADMIN"].includes(req.user!.role);
  if (!t || (!staff && t.student.userId !== req.user!.id)) {
    return res.status(404).json({ message: "Transcript not found." }); // same answer either way: no probing for other people's IDs
  }
  let payload: Record<string, unknown> | null = null;
  try {
    const parsed: unknown = t.payload ? JSON.parse(t.payload) : null;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) payload = parsed as Record<string, unknown>;
  } catch { /* unreadable stored text is treated the same as "not stored" */ }
  if (!payload) {
    return res.status(409).json({
      message: "This transcript was issued before printable copies were stored. Ask the registrar to re-issue it.",
      code: "TRANSCRIPT_NOT_PRINTABLE",
    });
  }
  res.json({
    documentId: t.documentId,
    issuedAt: t.issuedAt,
    revoked: t.revoked,
    revokedReason: t.revoked ? t.revokedReason : undefined,
    verificationUrl: t.verificationUrl,
    signatureValid: verifyDocument(payload, t.signedHash),
    qualificationLevel: t.student.programme.qualificationLevel,
    payload,
  });
});

// ---------------------------------------------------------------------------
// RG032/033/034 — generated student letters (status, enrollment
// verification, completion). Every letter's content is built from the
// student's real, current record at issue time, then signed the same way
// as a transcript/certificate. Completion letters assert the student
// actually finished the programme, so they're registrar-gated; the other
// two types only restate true current state, so a student may self-issue.
// ---------------------------------------------------------------------------

function buildLetterContent(
  type: "status" | "enrollment_verification" | "completion",
  student: { fullName: string; studentNumber: string; academicStatus: string; programme: { name: string; qualificationLevel: string } }
): string {
  const date = new Date().toLocaleDateString();
  if (type === "status") {
    return `This letter confirms that ${student.fullName} (${student.studentNumber}) has an academic status of "${student.academicStatus}" in the ${student.programme.name} programme as of ${date}.`;
  }
  if (type === "enrollment_verification") {
    return `This letter confirms that ${student.fullName} (${student.studentNumber}) is enrolled in the ${student.programme.name} programme (${student.programme.qualificationLevel}) as of ${date}.`;
  }
  return `This letter confirms that ${student.fullName} (${student.studentNumber}) has completed the ${student.programme.name} programme (${student.programme.qualificationLevel}) as of ${date}.`;
}

async function issueLetter(
  studentId: string,
  type: "status" | "enrollment_verification" | "completion",
  issuedById: string | null
) {
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    include: { programme: true },
  });
  if (!student) return null;
  if (type === "completion" && student.academicStatus !== "GRADUATED") {
    return { error: "Student has not been marked as graduated yet." };
  }

  const documentId = generateDocumentId("LTR");
  const content = buildLetterContent(type, student);
  const signedHash = signDocument({ documentId, content, studentNumber: student.studentNumber });
  const verificationUrl = `${process.env.PUBLIC_BASE_URL ?? "https://kvbdtc.ac.ke"}/verify/${documentId}`;

  const letter = await prisma.generatedLetter.create({
    data: { studentId, type, documentId, content, verificationUrl, signedHash, issuedById: issuedById ?? undefined },
  });
  return { letter };
}

const letterSchema = z.object({ type: z.enum(["status", "enrollment_verification", "completion"]) });

credentialsRouter.post(
  "/letters/:studentId",
  requireAuth,
  requireRole("REGISTRAR", "SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    const parsed = letterSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Choose a letter type." });
    const result = await issueLetter(req.params.studentId, parsed.data.type, req.user!.id);
    if (!result) return res.status(404).json({ message: "Student not found." });
    if ("error" in result) return res.status(400).json({ message: result.error });
    res.status(201).json(result.letter);
  }
);

// Self-service: a student can issue their own status or enrollment letter
// (both only restate true current state) but never a completion letter.
credentialsRouter.post("/letters/mine", requireAuth, async (req: AuthedRequest, res) => {
  const parsed = z.object({ type: z.enum(["status", "enrollment_verification"]) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Choose status or enrollment_verification." });

  const student = await prisma.student.findUnique({ where: { userId: req.user!.id } });
  if (!student) return res.status(404).json({ message: "No student record for this account." });

  const result = await issueLetter(student.id, parsed.data.type, null);
  if (!result) return res.status(404).json({ message: "Student not found." });
  if ("error" in result) return res.status(400).json({ message: result.error });
  res.status(201).json(result.letter);
});

credentialsRouter.get("/letters/mine", requireAuth, async (req: AuthedRequest, res) => {
  const student = await prisma.student.findUnique({ where: { userId: req.user!.id } });
  if (!student) return res.status(404).json({ message: "No student record for this account." });
  const letters = await prisma.generatedLetter.findMany({
    where: { studentId: student.id },
    orderBy: { issuedAt: "desc" },
  });
  res.json(letters);
});
// credentials still resolve via /verify but are clearly marked invalid —
// never silently deleted, so the history stays intact.
const revokeSchema = z.object({ reason: z.string().min(3) });

credentialsRouter.patch(
  "/transcripts/:documentId/revoke",
  requireAuth,
  requireRole("REGISTRAR", "SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    const parsed = revokeSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Give a reason for revocation." });

    const transcript = await prisma.transcript.update({
      where: { documentId: req.params.documentId },
      data: { revoked: true, revokedReason: parsed.data.reason, revokedAt: new Date() },
    });

    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        action: "TRANSCRIPT_REVOKED",
        entityType: "Transcript",
        entityId: transcript.id,
        metadata: { reason: parsed.data.reason },
      },
    });

    res.json(transcript);
  }
);

credentialsRouter.patch(
  "/certificates/:documentId/revoke",
  requireAuth,
  requireRole("REGISTRAR", "SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    const parsed = revokeSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Give a reason for revocation." });

    const certificate = await prisma.certificate.update({
      where: { documentId: req.params.documentId },
      data: { revoked: true, revokedReason: parsed.data.reason, revokedAt: new Date() },
    });

    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        action: "CERTIFICATE_REVOKED",
        entityType: "Certificate",
        entityId: certificate.id,
        metadata: { reason: parsed.data.reason },
      },
    });

    res.json(certificate);
  }
);
