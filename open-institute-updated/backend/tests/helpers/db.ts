// Shared harness for the Postgres-backed integration tests (tests/db/*.test.ts).
//
// These tests run against a REAL Postgres — there is no in-memory stand-in any more. Point
// TEST_DATABASE_URL at a throwaway database whose NAME CONTAINS "test" (the harness refuses
// anything else, because it TRUNCATEs tables), with the schema already applied:
//
//   createdb kvbdtc_test
//   DATABASE_URL=postgresql://.../kvbdtc_test npx prisma db push
//   TEST_DATABASE_URL=postgresql://.../kvbdtc_test npm run test:db
//
// When TEST_DATABASE_URL is unset every DB test SKIPS (so `npm test` stays green on a laptop with
// no database), and prints why.
export const TEST_DB_URL = process.env.TEST_DATABASE_URL;
export const dbSkipReason = TEST_DB_URL
  ? /test/i.test(new URL(TEST_DB_URL).pathname)
    ? false
    : "TEST_DATABASE_URL must point at a database whose name contains 'test' (refusing to truncate anything else)"
  : "TEST_DATABASE_URL is not set — Postgres-backed tests skipped";

// The client module reads DATABASE_URL at import time, so it is set BEFORE the dynamic import.
export async function getPrisma() {
  if (!TEST_DB_URL) throw new Error("TEST_DATABASE_URL not set");
  process.env.DATABASE_URL = TEST_DB_URL;
  const { prisma } = await import("../../src/lib/prisma.js");
  return prisma;
}

// TRUNCATE ... CASCADE from the roots. Children (Student, Unit, Course, mappings, results,
// submissions...) follow through their foreign keys; the two rate-limit/activity tables are listed
// explicitly because nothing references them.
export async function resetDb(prisma: Awaited<ReturnType<typeof getPrisma>>) {
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE "User", "Programme", "IntegrationEvent", "IntegrationCredential", "IntegrationRateLimitBucket", "VirtualLabActivity", "AuditLog" RESTART IDENTITY CASCADE`
  );
}

let seq = 0;
const n = () => ++seq;

export interface Fixture {
  admin: { id: string; role: string };
  trainerUser: { id: string; role: string };
  otherTrainerUser: { id: string; role: string };
  programmeId: string;
  unitId: string;
  otherUnitId: string;
  courseId: string;
  studentId: string;
  studentUserId: string;
  studentNumber: string;
  assessmentId: string;
  loId: string;
}

/** A minimal, valid slice of the portal: one programme, two units, a trainer per unit, one student, one assessment + rubric. */
export async function seedFixture(prisma: Awaited<ReturnType<typeof getPrisma>>): Promise<Fixture> {
  const i = n();
  const mkUser = (email: string, role: string) =>
    prisma.user.create({ data: { email, passwordHash: "x", role: role as never } });
  const [admin, trainerUser, otherTrainerUser, studentUser] = await Promise.all([
    mkUser(`admin${i}@t.test`, "ICT_ADMIN"),
    mkUser(`trainer${i}@t.test`, "TRAINER"),
    mkUser(`trainer2-${i}@t.test`, "TRAINER"),
    mkUser(`student${i}@t.test`, "STUDENT"),
  ]);
  const programme = await prisma.programme.create({
    data: { slug: `prog-${i}`, name: "Business Studies", qualificationLevel: "TVET Level 5", durationSemesters: 4, deliveryMode: "FULL_TIME" },
  });
  const unit = await prisma.unit.create({ data: { programmeId: programme.id, code: `BUS-${i}01`, title: "Bookkeeping", semester: 1, vblEnabled: true } });
  const otherUnit = await prisma.unit.create({ data: { programmeId: programme.id, code: `BUS-${i}02`, title: "Costing", semester: 1, vblEnabled: true } });
  const trainer = await prisma.trainer.create({ data: { userId: trainerUser.id, fullName: "T One", qualifications: [] } });
  const otherTrainer = await prisma.trainer.create({ data: { userId: otherTrainerUser.id, fullName: "T Two", qualifications: [] } });
  const course = await prisma.course.create({ data: { unitId: unit.id, trainerId: trainer.id, title: "Bookkeeping 101" } });
  const otherCourse = await prisma.course.create({ data: { unitId: otherUnit.id, trainerId: otherTrainer.id, title: "Costing 101" } });
  void otherCourse;
  const studentNumber = `KVB/${i}/2026`;
  const student = await prisma.student.create({
    data: { userId: studentUser.id, studentNumber, admissionNumber: `ADM-${i}`, fullName: "Test Student", programmeId: programme.id, intake: "2026-Sep", studyMode: "FULL_TIME" },
  });
  const assessment = await prisma.assessment.create({ data: { courseId: course.id, title: "Practical 1", type: "PRACTICAL", totalMarks: 100 } });
  await prisma.rubric.create({
    data: {
      assessmentId: assessment.id,
      createdById: admin.id,
      criteria: [
        { name: "Records", description: "", maxMarks: 50 },
        { name: "Reconciles", description: "", maxMarks: 50 },
      ],
    },
  });
  const lo = await prisma.learningOutcome.create({ data: { unitId: unit.id, code: "LO-1", description: "Post journal entries" } });
  return {
    admin: { id: admin.id, role: "ICT_ADMIN" },
    trainerUser: { id: trainerUser.id, role: "TRAINER" },
    otherTrainerUser: { id: otherTrainerUser.id, role: "TRAINER" },
    programmeId: programme.id,
    unitId: unit.id,
    otherUnitId: otherUnit.id,
    courseId: course.id,
    studentId: student.id,
    studentUserId: studentUser.id,
    studentNumber,
    assessmentId: assessment.id,
    loId: lo.id,
  };
}

/** Inserts a PENDING_APPROVAL Lab result directly (bypassing the webhook) for state-machine tests. */
export async function seedResult(
  prisma: Awaited<ReturnType<typeof getPrisma>>,
  f: Fixture,
  over: Record<string, unknown> = {}
) {
  const i = n();
  return prisma.virtualLabAssessmentResult.create({
    data: {
      studentId: f.studentId,
      unitId: f.unitId,
      externalAssessmentId: `ext-${i}`,
      outcome: "COMPETENT",
      decidedAt: new Date(),
      sourceEventId: `evt-${i}`,
      ...over,
    } as never,
  });
}

// ---- node:test glue -------------------------------------------------------------------------
import test, { after } from "node:test";

/** A test that skips (with the reason) unless a safe TEST_DATABASE_URL is configured. */
export function dbTest(name: string, fn: () => Promise<void> | void) {
  return test(name, { skip: dbSkipReason || undefined }, fn);
}

/** Connects once per test file and disconnects when the file's tests finish. */
export async function useDb() {
  if (dbSkipReason) return null as never; // every dbTest in the file is skipped; nothing touches this
  const prisma = await getPrisma();
  after(async () => {
    await prisma.$disconnect();
  });
  return prisma;
}
