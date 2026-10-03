// EX032 -- Similarity checking: pure logic, no DB access, so it can be
// unit-tested directly. See tests/similarity.test.ts.
//
// HONESTY NOTE: jaccardSimilarity (bag-of-words) and shingleSimilarity
// (n-gram, below) are both word-overlap metrics, not semantic or
// paraphrase-aware plagiarism detection. Reporting both catches more real
// copying than either alone (see shingleSimilarity's own note), but a
// well-paraphrased copy in genuinely different words will still score low
// on both. They exist to surface pairs worth a human's attention, not to
// make an automatic finding of misconduct.

export type SubmissionWithResponses = {
  id: string;
  assessmentId: string | null;
  textAnswer: string | null;
  questionResponses?: { questionId: string; answerGiven: string }[];
};

/**
 * Builds one comparable text for a submission, whichever shape its answers
 * are stored in.
 *
 * BUGFIX: the original implementation only ever read `textAnswer`. That
 * field is populated for free-text assignment submissions, but an exam
 * attempt's answers live in one `QuestionResponse` row per question (see
 * POST /exams/submissions/answers), so every exam submission compared as
 * "no text" and the checker silently never ran on exams.
 */
export function comparableText(submission: SubmissionWithResponses): string {
  if (submission.textAnswer && submission.textAnswer.trim() !== "") {
    return submission.textAnswer;
  }
  const responses = submission.questionResponses ?? [];
  if (responses.length === 0) return "";
  // Sort by questionId for a stable order regardless of DB return order, so
  // re-running a check on the same pair doesn't shuffle segment offsets.
  return [...responses]
    .sort((a, b) => a.questionId.localeCompare(b.questionId))
    .map((r) => r.answerGiven)
    .join("\n");
}

/** Jaccard similarity over words longer than 2 characters, as a 0-100 score. */
export function jaccardSimilarity(text1: string, text2: string): number {
  if (!text1 || !text2) return 0;

  const words1 = new Set(text1.toLowerCase().split(/\W+/).filter((w) => w.length > 2));
  const words2 = new Set(text2.toLowerCase().split(/\W+/).filter((w) => w.length > 2));

  if (words1.size === 0 || words2.size === 0) return 0;

  const intersection = new Set([...words1].filter((w) => words2.has(w)));
  const union = new Set([...words1, ...words2]);

  return (intersection.size / union.size) * 100;
}

/**
 * EX032 upgrade — n-gram (shingle) Jaccard similarity, over contiguous
 * word sequences rather than the bag-of-words `jaccardSimilarity` above.
 * Two answers that use the same words in a different order score lower
 * here than on the bag-of-words metric, so reporting both catches more
 * genuine copying (same phrasing, reordered) while still flagging fewer
 * false positives from two answers that merely share common vocabulary.
 * Still honestly NOT semantic similarity — a well-paraphrased copy (same
 * meaning, genuinely different words) will still score low on both
 * metrics. That gap needs an embedding model, which this codebase has no
 * credentialed access to; see AI007's similar honesty note.
 */
export function shingleSimilarity(text1: string, text2: string, n = 3): number {
  const shingles = (text: string): Set<string> => {
    const words = text.toLowerCase().split(/\W+/).filter((w) => w.length > 0);
    if (words.length < n) return new Set(words.length > 0 ? [words.join(" ")] : []);
    const set = new Set<string>();
    for (let i = 0; i <= words.length - n; i++) set.add(words.slice(i, i + n).join(" "));
    return set;
  };
  const a = shingles(text1);
  const b = shingles(text2);
  if (a.size === 0 || b.size === 0) return 0;
  const intersection = new Set([...a].filter((s) => b.has(s)));
  const union = new Set([...a, ...b]);
  return (intersection.size / union.size) * 100;
}

export type OverlapSegment = { start: number; end: number; text: string };

/** Finds runs of 3+ consecutive words from text1 that also appear in text2. */
export function findOverlappingSegments(text1: string, text2: string): OverlapSegment[] {
  const segments: OverlapSegment[] = [];
  const words1 = text1.split(/\s+/);
  const words2 = new Set(text2.toLowerCase().split(/\s+/));

  for (let i = 0; i < words1.length; i++) {
    let j = i;
    const start = i;

    while (j < words1.length && words2.has(words1[j].toLowerCase())) {
      j++;
    }
    const matchCount = j - i;

    if (matchCount >= 3) {
      const segmentText = words1.slice(start, j).join(" ");
      const idx = text1.indexOf(segmentText);
      segments.push({ start: idx, end: idx + segmentText.length, text: segmentText });
      i = j - 1; // skip ahead past the run we just recorded
    }
  }

  return segments;
}
