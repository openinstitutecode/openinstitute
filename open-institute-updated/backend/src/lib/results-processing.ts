import { prisma } from "./prisma.js";
import { percentToLetterGrade, PASS_MARK_PERCENT } from "./grade-scale.js";

// ---------------------------------------------------------------------------
// RG025 — Results processing.
//
// Before this, an assessment's results being approved (RG026/RG027) never
// produced anything a transcript, academic-standing check, or graduation
// audit could actually read: Enrollment.finalGrade was written only by the
// credit-transfer "CR" shortcut (RG008). An ordinary unit's grade stayed
// null forever, so RG020's transcript would show a blank grade column for
// every real unit a student completed. This module is the missing pipeline:
// it aggregates every APPROVED assessment's marks-weighted score for a
// course, resolves each student's current in-progress Enrollment for that
// course's unit, and writes finalGrade + completed/failed status.
//
// It is deliberately conservative: it only finalizes a unit once every
// non-draft assessment on the course has resultsApprovedAt set (no partial/
// premature grade from only the CATs and not the final exam), and it never
// overwrites an Enrollment that already has a finalGrade unless explicitly
// forced (results-approval.ts's manual endpoint, used by a registrar/exam
// officer for a genuine re-run after a late amendment).
// ---------------------------------------------------------------------------

export type CourseProcessingStatus = {
  courseId: string;
  unitCode: string;
  unitTitle: string;
  totalAssessments: number;
  approvedAssessments: number;
  readyToFinalize: boolean;
  alreadyFinalizedCount: number;
};

export async function getCourseProcessingStatus(courseId: string): Promise<CourseProcessingStatus | null> {
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    include: { unit: true, assessments: { where: { isDraft: false } } },
  });
  if (!course) return null;

  const approved = course.assessments.filter((a) => a.resultsApprovedAt);
  const finalized = await prisma.enrollment.count({
    where: { unitId: course.unitId, finalGrade: { not: null } },
  });

  return {
    courseId: course.id,
    unitCode: course.unit.code,
    unitTitle: course.unit.title,
    totalAssessments: course.assessments.length,
    approvedAssessments: approved.length,
    readyToFinalize: course.assessments.length > 0 && approved.length === course.assessments.length,
    alreadyFinalizedCount: finalized,
  };
}

// Real, current pass rate over whatever has already been finalized for a
// unit — used by the Examination Board flagged-results view (RG029). Not
// the same as academic standing (RG014), which looks at a student across
// every unit; this is one unit's own pass rate.
export async function getCoursePassRate(
  courseId: string
): Promise<{ studentsCovered: number; passRate: number | null }> {
  const course = await prisma.course.findUnique({ where: { id: courseId }, select: { unitId: true } });
  if (!course) return { studentsCovered: 0, passRate: null };

  const finalized = await prisma.enrollment.findMany({
    where: { unitId: course.unitId, finalGrade: { not: null } },
    select: { status: true },
  });
  if (finalized.length === 0) return { studentsCovered: 0, passRate: null };

  const passed = finalized.filter((e) => e.status === "completed").length;
  return { studentsCovered: finalized.length, passRate: (passed / finalized.length) * 100 };
}

export type FinalizeResult = {
  finalized: number;
  skippedNoEnrollment: number;
  skippedAlreadyFinal: number;
};

export async function finalizeCourseResults(
  courseId: string,
  opts: { force?: boolean } = {}
): Promise<FinalizeResult> {
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    include: { assessments: { where: { isDraft: false }, include: { submissions: true } } },
  });
  if (!course) throw new Error("Course not found.");

  const approved = course.assessments.filter((a) => a.resultsApprovedAt);
  if (approved.length === 0 || approved.length !== course.assessments.length) {
    // Not every assessment on this course has approved results yet —
    // nothing to finalize. Not an error: this is the normal state for a
    // course mid-semester.
    return { finalized: 0, skippedNoEnrollment: 0, skippedAlreadyFinal: 0 };
  }

  // studentUserId -> { earned, possible }, aggregated marks-weighted across
  // every approved assessment on the course (a CAT worth 20 marks counts
  // for less of the final percentage than a final exam worth 100).
  const totals = new Map<string, { earned: number; possible: number }>();
  for (const a of approved) {
    for (const s of a.submissions) {
      if (s.score === null || s.score === undefined) continue;
      const t = totals.get(s.studentUserId) ?? { earned: 0, possible: 0 };
      t.earned += s.score;
      t.possible += a.totalMarks;
      totals.set(s.studentUserId, t);
    }
  }

  let finalized = 0;
  let skippedNoEnrollment = 0;
  let skippedAlreadyFinal = 0;

  for (const [studentUserId, t] of totals) {
    if (t.possible <= 0) continue;

    const student = await prisma.student.findUnique({ where: { userId: studentUserId } });
    if (!student) {
      skippedNoEnrollment++;
      continue;
    }

    const enrollment = await prisma.enrollment.findFirst({
      where: { studentId: student.id, unitId: course.unitId, status: "in_progress" },
      orderBy: { createdAt: "desc" },
    });
    if (!enrollment) {
      skippedNoEnrollment++;
      continue;
    }
    if (enrollment.finalGrade && !opts.force) {
      skippedAlreadyFinal++;
      continue;
    }

    const percent = (t.earned / t.possible) * 100;
    const letter = percentToLetterGrade(percent);
    const passed = percent >= PASS_MARK_PERCENT;

    await prisma.enrollment.update({
      where: { id: enrollment.id },
      data: { finalGrade: letter, status: passed ? "completed" : "failed" },
    });
    finalized++;
  }

  return { finalized, skippedNoEnrollment, skippedAlreadyFinal };
}
