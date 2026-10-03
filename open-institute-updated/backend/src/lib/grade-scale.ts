// RG025 — the institution-wide percentage -> letter grade scale used when
// finalizing a unit's results. This mirrors the common Kenyan TVET
// convention (A/B/C/D/E, pass at 40%). It is deliberately a single shared
// scale rather than a per-programme setting, unlike ProgressionRule (RG015)
// — that model governs a student's overall academic *standing* across many
// units; this constant governs the grade written for *one* unit. If a
// future batch needs different boundaries per qualification level, this is
// the one place to make it configurable the same way RG015 did.
export const GRADE_BANDS: ReadonlyArray<{ min: number; letter: string }> = [
  { min: 70, letter: "A" },
  { min: 60, letter: "B" },
  { min: 50, letter: "C" },
  { min: 40, letter: "D" },
  { min: 0, letter: "E" },
];

export const PASS_MARK_PERCENT = 40;

export function percentToLetterGrade(percent: number): string {
  const clamped = Math.max(0, Math.min(100, percent));
  const band = GRADE_BANDS.find((b) => clamped >= b.min);
  return band ? band.letter : "E";
}
