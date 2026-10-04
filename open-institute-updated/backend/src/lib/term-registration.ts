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
