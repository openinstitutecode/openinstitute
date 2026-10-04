export const MIN_TERM_CREDITS = 8;

export function isEightWeekTerm(startDate: Date, endDate: Date) {
  return Number.isFinite(startDate.getTime()) &&
    Number.isFinite(endDate.getTime()) &&
    Math.round((endDate.getTime() - startDate.getTime()) / 86_400_000) + 1 === 56;
}

export function endOfUtcDate(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1) - 1);
}

export function creditLoadViolation(credits: number, maximum: number): "minimum" | "maximum" | null {
  if (credits < MIN_TERM_CREDITS) return "minimum";
  if (credits > maximum) return "maximum";
  return null;
}

export function calculateTermInvoice(credits: number, rate: number, adminFee: number, industrialFee: number) {
  const tuition = credits * rate;
  return { tuition, total: tuition + adminFee + industrialFee };
}

function calendarDate(value: unknown): Date | null {
  if (typeof value !== "string" && !(value instanceof Date)) return null;
  if (typeof value === "string") {
    const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (dateOnly) {
      const year = Number(dateOnly[1]);
      const month = Number(dateOnly[2]) - 1;
      const day = Number(dateOnly[3]);
      const parsedDate = new Date(Date.UTC(year, month, day));
      if (
        parsedDate.getUTCFullYear() !== year ||
        parsedDate.getUTCMonth() !== month ||
        parsedDate.getUTCDate() !== day
      ) return null;
      return parsedDate;
    }
  }
  const parsed = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(parsed.getTime())) return null;
  return new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()));
}

function addCalendarDays(date: Date, days: number) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + days));
}

function boundedInteger(value: unknown, minimum: number, maximum: number, fallback: number) {
  const numeric = typeof value === "number" || typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isInteger(numeric) ? Math.max(minimum, Math.min(maximum, numeric)) : fallback;
}

export function normalizeTermSetup(
  input: Record<string, unknown>,
  now = new Date(),
) {
  const today = calendarDate(now)!;
  const startDate = calendarDate(input.startDate) ?? today;
  const submittedEndDate = calendarDate(input.endDate);
  const endDate = submittedEndDate && isEightWeekTerm(startDate, submittedEndDate)
    ? submittedEndDate
    : addCalendarDays(startDate, 55);

  const registrationOpen = calendarDate(input.registrationOpen) ?? today;
  let registrationClose = calendarDate(input.registrationClose) ?? startDate;
  if (registrationClose < registrationOpen) {
    registrationClose = registrationOpen > startDate ? registrationOpen : startDate;
  }

  let assessmentStart = calendarDate(input.assessmentStart) ?? addCalendarDays(endDate, -7);
  let assessmentEnd = calendarDate(input.assessmentEnd) ?? endDate;
  if (assessmentEnd < assessmentStart) {
    assessmentStart = addCalendarDays(endDate, -7);
    assessmentEnd = endDate;
  }

  const submittedResultsDate = calendarDate(input.resultsDueDate);
  const resultsDueDate = submittedResultsDate && submittedResultsDate > endDate
    ? submittedResultsDate
    : addCalendarDays(endDate, 14);

  const currentYear = today.getUTCFullYear();
  const academicYear = typeof input.academicYear === "string" && /^\d{4}\/\d{4}$/.test(input.academicYear)
    ? input.academicYear
    : `${currentYear}/${currentYear + 1}`;

  return {
    semesterNumber: boundedInteger(input.semesterNumber, 1, 1000, 1),
    academicYear,
    startDate,
    endDate,
    registrationOpen,
    registrationClose,
    assessmentStart,
    assessmentEnd,
    resultsDueDate,
    termWeeks: 8,
    maxCreditsPerTerm: boundedInteger(input.maxCreditsPerTerm, 24, 36, 24),
    creditRate: boundedInteger(input.creditRate, 300, 500, 300),
    adminFee: 1000,
  };
}
