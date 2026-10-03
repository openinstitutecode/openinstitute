// Batch 76 — quiz engine v2 (LMS-QZ-006…080). Pure logic, no database.
import test from "node:test";
import assert from "node:assert/strict";

import { scoreQuiz } from "../src/lib/quiz-scoring.js";
import {
  aggregateAttempts, buildReviewItems, canSeeAnswerKey, canSeeScore, checkAvailability, classifyItem, drawRandom, finalScoreWithManual, fractionCorrect, isAutoMarkable,
  itemStats, normaliseQuestion, paginate, parseCsv, parseNumber, parseQuestionCsv, parseRandomRules, questionToCsvRow, scoreQuestion, scoreQuizV2, studentView, toCsv,
  type EngineQuestion,
} from "../src/lib/quiz-engine.js";

const q = (o: Partial<EngineQuestion> & { id: string; type: string }): EngineQuestion => ({ marks: 2, ...o });

// ---------------------------------------------------------------- legacy parity
test("legacy parity: mcq/short/essay score exactly as scoreQuiz always did", () => {
  const qs = [
    q({ id: "a", type: "mcq", marks: 2, correctAnswer: "Paris", options: ["Paris", "Rome"] }),
    q({ id: "b", type: "mcq", marks: 3, correctAnswer: "4", options: ["3", "4"] }),
  ];
  const rs = [{ questionId: "a", answerGiven: " paris " }, { questionId: "b", answerGiven: "3" }];
  const old = scoreQuiz(qs as any, rs, 10);
  const now = scoreQuizV2(qs, rs, 10);
  assert.equal(now.score, old.score);
  assert.equal(now.correctCount, old.correctCount);
  assert.equal(now.fullyAutoMarkable, old.fullyAutoMarkable);
});

test("legacy parity: any essay / unkeyed short answer leaves the score to a human", () => {
  const qs = [q({ id: "a", type: "mcq", correctAnswer: "x", options: ["x", "y"] }), q({ id: "b", type: "short_answer" })];
  const r = scoreQuizV2(qs, [{ questionId: "a", answerGiven: "x" }], 10);
  assert.equal(r.fullyAutoMarkable, false);
  assert.equal(r.score, null);
  assert.equal(r.autoMarksScaled, 5);
  assert.equal(r.manualCount, 1);
});

// ---------------------------------------------------------------- question types
test("QZ008 multiple-correct: exact set only, unless partial credit", () => {
  const base = q({ id: "m", type: "mcq_multi", marks: 4, options: ["a", "b", "c", "d"], config: { correct: ["a", "b"] } });
  assert.equal(fractionCorrect(base, JSON.stringify(["b", "a"])), 1);
  assert.equal(fractionCorrect(base, JSON.stringify(["a"])), 0);
  assert.equal(fractionCorrect(base, JSON.stringify(["a", "b", "c"])), 0);
  const partial = { ...base, config: { correct: ["a", "b"], partialCredit: true } };
  assert.equal(fractionCorrect(partial, JSON.stringify(["a"])), 0.5);
  assert.equal(fractionCorrect(partial, JSON.stringify(["a", "b", "c"])), 0.5); // 2 right - 1 wrong over 2
  assert.equal(fractionCorrect(partial, JSON.stringify(["c", "d"])), 0); // never negative
});

test("QZ010 fill-in-the-blank: per-blank accepted answers, case-insensitive by default", () => {
  const f = q({ id: "f", type: "fill_blank", config: { blanks: [["Nairobi"], ["KES", "Kenya shilling"]] } });
  assert.equal(fractionCorrect(f, JSON.stringify(["nairobi", "kenya  Shilling"])), 1);
  assert.equal(fractionCorrect(f, JSON.stringify(["Nairobi", "USD"])), 0);
  const p = { ...f, config: { ...f.config, partialCredit: true } };
  assert.equal(fractionCorrect(p, JSON.stringify(["Nairobi", "USD"])), 0.5);
  const cs = { ...f, config: { blanks: [["Nairobi"]], caseSensitive: true } };
  assert.equal(fractionCorrect(cs, JSON.stringify(["nairobi"])), 0);
});

test("QZ011/QZ024 short answer: multiple accepted answers auto-mark; none = hand-marked", () => {
  const s = q({ id: "s", type: "short_answer", config: { acceptedAnswers: ["Debit", "DR"] } });
  assert.equal(isAutoMarkable(s), true);
  assert.equal(fractionCorrect(s, " dr "), 1);
  assert.equal(fractionCorrect(s, "credit"), 0);
  assert.equal(isAutoMarkable(q({ id: "s2", type: "short_answer" })), false);
});

test("QZ012 numerical: tolerance (absolute and percent), units, decimal comma, junk", () => {
  const abs = q({ id: "n", type: "numerical", config: { numeric: { answer: 12.5, tolerance: 0.5, toleranceType: "abs", unit: "kg" } } });
  assert.equal(fractionCorrect(abs, "12.9 kg"), 1);
  assert.equal(fractionCorrect(abs, "13.1"), 0);
  assert.equal(fractionCorrect(abs, "12,5"), 1);
  assert.equal(fractionCorrect(abs, "twelve"), 0);
  const pct = q({ id: "n2", type: "numerical", config: { numeric: { answer: 200, tolerance: 5, toleranceType: "percent" } } });
  assert.equal(fractionCorrect(pct, "209"), 1);
  assert.equal(fractionCorrect(pct, "211"), 0);
  assert.equal(parseNumber("1,200.50"), 1200.5);
  assert.equal(parseNumber("1e3"), 1000);
  assert.equal(parseNumber(""), null);
  assert.equal(parseNumber("12abc"), null);
  const float = q({ id: "n3", type: "numerical", config: { numeric: { answer: 0.3 } } });
  assert.equal(fractionCorrect(float, String(0.1 + 0.2)), 1, "float noise must not cost a mark");
});

test("QZ013 matching and QZ014 ordering", () => {
  const m = q({ id: "m", type: "matching", config: { pairs: [{ left: "Asset", right: "Owned" }, { left: "Liability", right: "Owed" }, { left: "Equity", right: "Residual" }] } });
  assert.equal(fractionCorrect(m, JSON.stringify({ Asset: "Owned", Liability: "Owed", Equity: "Residual" })), 1);
  assert.equal(fractionCorrect(m, JSON.stringify({ Asset: "Owed", Liability: "Owned", Equity: "Residual" })), 0);
  const mp = { ...m, config: { ...m.config, partialCredit: true } };
  assert.ok(Math.abs(fractionCorrect(mp, JSON.stringify({ Asset: "Owed", Liability: "Owned", Equity: "Residual" })) - 1 / 3) < 1e-9);
  const o = q({ id: "o", type: "ordering", config: { order: ["Plan", "Do", "Check", "Act"] } });
  assert.equal(fractionCorrect(o, JSON.stringify(["Plan", "Do", "Check", "Act"])), 1);
  assert.equal(fractionCorrect(o, JSON.stringify(["Do", "Plan", "Check", "Act"])), 0);
  assert.equal(fractionCorrect({ ...o, config: { ...o.config, partialCredit: true } }, JSON.stringify(["Do", "Plan", "Check", "Act"])), 0.5);
});

test("QZ019-021 case study / scenario / practical are always hand-marked", () => {
  for (const type of ["essay", "case_study", "scenario", "practical"]) {
    const r = scoreQuestion(q({ id: "x", type }), "some answer");
    assert.equal(r.needsManual, true);
    assert.equal(r.marksAwarded, null);
  }
});

// ---------------------------------------------------------------- marking policy
test("QZ026 negative marking applies only to attempted wrong answers and floors the quiz at 0", () => {
  const a = q({ id: "a", type: "mcq", marks: 4, correctAnswer: "x", options: ["x", "y"], config: { negativeFraction: 0.25 } });
  assert.equal(scoreQuestion(a, "y").marksAwarded, -1);
  assert.equal(scoreQuestion(a, "").marksAwarded, 0, "blank is not penalised");
  assert.equal(scoreQuestion(a, "x").marksAwarded, 4);
  const qs = [a, { ...a, id: "b" }];
  const r = scoreQuizV2(qs, [{ questionId: "a", answerGiven: "y" }, { questionId: "b", answerGiven: "y" }], 8);
  assert.equal(r.score, 0, "total never goes below zero");
});

test("scaling: score is scaled to totalMarks whatever the per-question marks add to", () => {
  const qs = [q({ id: "a", type: "mcq", marks: 1, correctAnswer: "x", options: ["x", "y"] }), q({ id: "b", type: "mcq", marks: 3, correctAnswer: "x", options: ["x", "y"] })];
  assert.equal(scoreQuizV2(qs, [{ questionId: "b", answerGiven: "x" }], 100).score, 75);
});

test("QZ066 manual marks combine with auto marks; missing manual mark = incomplete", () => {
  const qs = [q({ id: "a", type: "mcq", marks: 2, correctAnswer: "x", options: ["x", "y"] }), q({ id: "e", type: "essay", marks: 8 })];
  const auto = scoreQuizV2(qs, [{ questionId: "a", answerGiven: "x" }, { questionId: "e", answerGiven: "text" }], 10);
  assert.equal(auto.score, null);
  assert.deepEqual(finalScoreWithManual(auto, {}, qs, 10), { score: 2, complete: false });
  assert.deepEqual(finalScoreWithManual(auto, { e: 6 }, qs, 10), { score: 8, complete: true });
  assert.equal(finalScoreWithManual(auto, { e: 99 }, qs, 10).score, 10, "manual marks are capped at the question maximum");
});

// ---------------------------------------------------------------- attempts → grade
test("QZ051-053 grading methods skip attempts still awaiting marking", () => {
  const t = (n: number) => new Date(2026, 0, n);
  const at = [{ score: 40, submittedAt: t(1) }, { score: 90, submittedAt: t(2) }, { score: null, submittedAt: t(3) }, { score: 60, submittedAt: t(4) }];
  assert.equal(aggregateAttempts(at, "HIGHEST"), 90);
  assert.equal(aggregateAttempts(at, "AVERAGE"), 63.33);
  assert.equal(aggregateAttempts(at, "LATEST"), 60);
  assert.equal(aggregateAttempts(at, "FIRST"), 40);
  assert.equal(aggregateAttempts([{ score: null, submittedAt: t(1) }], "HIGHEST"), null);
  assert.equal(aggregateAttempts([], "AVERAGE"), null);
});

// ---------------------------------------------------------------- availability
test("QZ047/048/079/080 availability: draft, group, opens, closes, attempts, extension", () => {
  const base = { isDraft: false, type: "FORMATIVE_QUIZ", scheduledAt: null, durationMinutes: null, maxAttempts: 2 };
  const now = new Date("2026-06-15T10:00:00Z");
  const ctx = { now, attemptsUsed: 0 };
  assert.equal(checkAvailability({ ...base, isDraft: true }, ctx).code, "draft");
  assert.equal(checkAvailability(base, ctx).open, true);
  assert.equal(checkAvailability({ ...base, allowedIntakes: ["2026-Jan"] }, { ...ctx, studentIntake: "2026-May" }).code, "group");
  assert.equal(checkAvailability({ ...base, allowedIntakes: ["2026-Jan"] }, { ...ctx, studentIntake: " 2026-jan " }).open, true);
  assert.equal(checkAvailability({ ...base, opensAt: new Date("2026-06-16T00:00:00Z") }, ctx).code, "not_open");
  const closed = { ...base, closesAt: new Date("2026-06-14T00:00:00Z") };
  assert.equal(checkAvailability(closed, ctx).code, "closed");
  assert.equal(checkAvailability(closed, { ...ctx, extendedCloseAt: new Date("2026-06-20T00:00:00Z") }).open, true, "extension reopens");
  assert.equal(checkAvailability(base, { ...ctx, attemptsUsed: 2 }).code, "no_attempts");
  assert.equal(checkAvailability(base, { ...ctx, attemptsUsed: 2, extraAttempts: 1 }).open, true);
  // legacy: a CAT's scheduledAt is its opening time; scheduledAt+duration is its sitting window
  const cat = { ...base, type: "CAT", scheduledAt: new Date("2026-06-15T09:00:00Z"), durationMinutes: 30 };
  assert.equal(checkAvailability(cat, ctx).code, "closed");
  assert.equal(checkAvailability({ ...cat, scheduledAt: new Date("2026-06-15T11:00:00Z") }, ctx).code, "not_open");
});

// ---------------------------------------------------------------- visibility
test("QZ063/064/069/070/071 score and answer-key visibility", () => {
  const now = new Date("2026-06-15T10:00:00Z");
  const v = { resultVisibility: "IMMEDIATE", markingMode: "IMMEDIATE", resultsPublished: false, closesAt: null as Date | null, answerKeyReleaseAt: null as Date | null };
  assert.equal(canSeeScore(v, now), true);
  assert.equal(canSeeScore({ ...v, markingMode: "DEFERRED" }, now), false);
  assert.equal(canSeeScore({ ...v, markingMode: "DEFERRED", resultsPublished: true }, now), true);
  assert.equal(canSeeScore({ ...v, resultVisibility: "HIDDEN" }, now), false);
  assert.equal(canSeeScore({ ...v, resultVisibility: "ON_RELEASE" }, now), false);
  assert.equal(canSeeScore({ ...v, resultVisibility: "ON_RELEASE", resultsPublished: true }, now), true);
  assert.equal(canSeeScore({ ...v, resultVisibility: "AFTER_CLOSE", closesAt: new Date("2026-06-16T00:00:00Z") }, now), false);
  assert.equal(canSeeScore({ ...v, resultVisibility: "AFTER_CLOSE", closesAt: new Date("2026-06-14T00:00:00Z") }, now), true);
  assert.equal(canSeeAnswerKey(v, now, false), false);
  assert.equal(canSeeAnswerKey(v, now, true), true);
  assert.equal(canSeeAnswerKey({ ...v, answerKeyReleaseAt: new Date("2026-06-20T00:00:00Z") }, now, true), false, "delayed key release");
  assert.equal(canSeeAnswerKey({ ...v, resultVisibility: "HIDDEN" }, now, true), false, "no key when the score itself is hidden");
});

// ---------------------------------------------------------------- random + pages
test("QZ035 random selection: stable per seed, no duplicates, honours topic/difficulty", () => {
  const pool = Array.from({ length: 20 }, (_, i) => ({ id: `q${i}`, topic: i < 10 ? "tax" : "audit", difficulty: i % 2 ? "hard" : "easy" }));
  const rules = [{ count: 3, topic: "tax" }, { count: 2, topic: "audit", difficulty: "hard" }];
  const a = drawRandom(pool, rules, "stu1");
  assert.equal(a.length, 5);
  assert.equal(new Set(a.map((x) => x.id)).size, 5);
  assert.deepEqual(a, drawRandom(pool, rules, "stu1"), "same student → same draw");
  assert.notDeepEqual(a.map((x) => x.id), drawRandom(pool, rules, "stu2").map((x) => x.id));
  assert.ok(a.slice(0, 3).every((x) => x.topic === "tax"));
  assert.ok(a.slice(3).every((x) => x.topic === "audit" && x.difficulty === "hard"));
  assert.equal(drawRandom(pool, [{ count: 50 }], "s").length, 20, "can't draw more than exist");
  assert.deepEqual(parseRandomRules([{ count: 0 }, { count: 2, difficulty: "weird" }, "x", { count: 3, topic: " t " }]), [{ count: 2, topic: undefined, difficulty: undefined }, { count: 3, topic: "t", difficulty: undefined }]);
});

test("QZ056/057 pagination", () => {
  assert.deepEqual(paginate([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
  assert.deepEqual(paginate([1, 2, 3], 1), [[1], [2], [3]]);
  assert.deepEqual(paginate([1, 2, 3], null), [[1, 2, 3]]);
  assert.deepEqual(paginate([], 5), [[]]);
});

// ---------------------------------------------------------------- authoring validation
test("normaliseQuestion rejects broken questions for every type", () => {
  const bad = (t: string, extra: object, re: RegExp) => { const r = normaliseQuestion({ type: t, prompt: "Prompt ___", ...extra } as any); assert.equal(typeof r, "string"); assert.match(r as string, re); };
  bad("mcq", { options: ["a"], correctAnswer: "a" }, /at least two/);
  bad("mcq", { options: ["a", "b"], correctAnswer: "c" }, /correct answer/);
  bad("mcq", { options: ["a", "A"], correctAnswer: "a" }, /different/);
  bad("mcq_multi", { options: ["a", "b"], config: { correct: [] } }, /at least one correct/);
  bad("mcq_multi", { options: ["a", "b"], config: { correct: ["a", "b"] } }, /Not every option/);
  bad("mcq_multi", { options: ["a", "b"], config: { correct: ["z"] } }, /match one of the options/);
  bad("true_false", { correctAnswer: "maybe" }, /True or False/);
  bad("fill_blank", { config: { blanks: [["a"], ["b"]] } }, /2 blank marker/);
  bad("fill_blank", { config: { blanks: [[]] } }, /accepted answer/);
  bad("numerical", { config: {} }, /numeric answer/);
  bad("numerical", { config: { numeric: { answer: 1, tolerance: -1 } } }, /negative/);
  bad("matching", { config: { pairs: [{ left: "a", right: "b" }] } }, /two pairs/);
  bad("matching", { config: { pairs: [{ left: "a", right: "b" }, { left: "A", right: "c" }] } }, /different/);
  bad("ordering", { config: { order: ["a"] } }, /two items/);
  bad("case_study", {}, /case study/);
  bad("nonsense", {}, /Unknown/);
  bad("mcq", { options: ["a", "b"], correctAnswer: "a", config: { negativeFraction: 2 } }, /Negative marking/);
});

test("normaliseQuestion canonicalises valid questions", () => {
  const tf = normaliseQuestion({ type: "true_false", prompt: "Sky is blue", correctAnswer: " TRUE " });
  assert.deepEqual(tf, { type: "mcq", options: ["True", "False"], correctAnswer: "True", config: null });
  const fb = normaliseQuestion({ type: "fill_blank", prompt: "Capital of Kenya is ___ and currency ___", config: { blanks: [["Nairobi"], ["KES"]] } });
  assert.ok(typeof fb !== "string" && fb.type === "fill_blank" && isAutoMarkable({ type: fb.type, correctAnswer: fb.correctAnswer, config: fb.config }));
  const sa = normaliseQuestion({ type: "short_answer", prompt: "Define GAAP", correctAnswer: "Generally Accepted Accounting Principles", config: { acceptedAnswers: ["GAAP"] } });
  assert.ok(typeof sa !== "string" && sa.config?.acceptedAnswers?.length === 1 && sa.correctAnswer === "Generally Accepted Accounting Principles");
  const model = normaliseQuestion({ type: "short_answer", prompt: "Explain accrual accounting briefly", correctAnswer: "model answer" });
  assert.ok(typeof model !== "string" && model.config === null, "model answer alone keeps a hand-marked short answer");
});

// ---------------------------------------------------------------- student view never leaks the key
test("studentView never contains the answer key", () => {
  const cases: EngineQuestion[] = [
    q({ id: "1", type: "mcq", correctAnswer: "SECRET", options: ["SECRET", "b"] }),
    q({ id: "2", type: "mcq_multi", options: ["a", "b", "c"], config: { correct: ["SECRETA"] } }),
    q({ id: "3", type: "fill_blank", config: { blanks: [["SECRETB"]] } }),
    q({ id: "4", type: "numerical", config: { numeric: { answer: 424242, tolerance: 1, unit: "kg" } } }),
    q({ id: "5", type: "matching", config: { pairs: [{ left: "L1", right: "R1" }, { left: "L2", right: "R2" }] } }),
    q({ id: "6", type: "ordering", config: { order: ["first", "second", "third"] } }),
    q({ id: "7", type: "short_answer", correctAnswer: "SECRETC", config: { acceptedAnswers: ["SECRETD"] } }),
  ];
  for (const c of cases) {
    const json = JSON.stringify(studentView({ ...c, prompt: "p" }, "seed"));
    // an mcq's correct option is necessarily one of its visible options, so that single value is exempt
    const secrets = c.type === "mcq" ? [] : ["SECRET", "424242"];
    for (const leak of [...secrets, '"correct"', "acceptedAnswers", "tolerance", "caseSensitive", "correctAnswer"]) {
      assert.ok(!json.includes(leak), `${c.type} leaked ${leak}`);
    }
  }
  // an mcq's correct option is necessarily one of the visible options; make sure that is the ONLY place it shows
  const mcq = studentView({ ...cases[0], prompt: "p" }) as any;
  assert.equal(mcq.correctAnswer, undefined);
  const ord = studentView({ ...cases[5], prompt: "p" }, "x") as any;
  assert.deepEqual([...ord.options].sort(), ["first", "second", "third"]);
  assert.notDeepEqual(ord.options, ["first", "second", "third"], "ordering is never served in the answer order");
  const match = studentView({ ...cases[4], prompt: "p" }, "x") as any;
  assert.deepEqual(match.lefts, ["L1", "L2"]);
});

// ---------------------------------------------------------------- CSV
test("CSV parser handles quotes, commas, newlines, BOM and CRLF", () => {
  const rows = parseCsv('\uFEFFa,b,c\r\n"x, y","he said ""hi""","line1\nline2"\r\n\r\n1,2,3');
  assert.deepEqual(rows, [["a", "b", "c"], ["x, y", 'he said "hi"', "line1\nline2"], ["1", "2", "3"]]);
});

test("toCsv neutralises spreadsheet formula injection but keeps negative numbers", () => {
  const out = toCsv([["=HYPERLINK(\"x\")", "+1+1", "@SUM", "-5", "ok, fine"]]);
  assert.ok(out.startsWith("\"'=HYPERLINK(\"\"x\"\")\",'+1+1,'@SUM,-5,\"ok, fine\""));
});

test("QZ041/042/043 question CSV round-trips every type", () => {
  const csv = [
    "type,prompt,marks,difficulty,topic,options,correct,explanation,tags",
    "mcq,Capital of Kenya?,2,easy,geo,Nairobi|Mombasa|Kisumu,Nairobi,It is,geo|kenya",
    "mcq_multi,Pick primes,3,medium,maths,2|3|4|9,2|3,,",
    "true_false,The sky is blue,1,easy,,,true,,",
    "fill_blank,Currency of Kenya is ___,1,easy,,,KES/Kenya shilling,,",
    "short_answer,Define asset,2,medium,acc,,Resource owned|an asset,,",
    "numerical,Compute 5/2,1,hard,maths,,2.5±0.1,,",
    "matching,Match terms,4,medium,acc,Asset=Owned|Liability=Owed,,,",
    "ordering,Order the cycle,3,medium,,,Plan|Do|Check|Act,,",
    "essay,Discuss ethics,10,hard,,,,,",
  ].join("\n");
  const r = parseQuestionCsv(csv);
  assert.deepEqual(r.errors, []);
  assert.equal(r.questions.length, 9);
  const roundTrip = r.questions.map((x) => {
    const n = x.normalised;
    return questionToCsvRow({ type: n.type, prompt: x.prompt, marks: x.marks, difficulty: x.difficulty, topic: x.topic ?? null, options: n.options, correctAnswer: n.correctAnswer, explanation: x.explanation ?? null, tags: x.tags, config: n.config });
  });
  const again = parseQuestionCsv(toCsv([["type", "prompt", "marks", "difficulty", "topic", "options", "correct", "explanation", "tags"], ...roundTrip]));
  assert.deepEqual(again.errors, []);
  assert.deepEqual(again.questions.map((x) => x.normalised), r.questions.map((x) => x.normalised), "export → import yields identical questions");
  const num = r.questions[5].normalised.config!.numeric!;
  assert.deepEqual([num.answer, num.tolerance], [2.5, 0.1]);
});

test("question CSV reports bad rows without dropping good ones", () => {
  const r = parseQuestionCsv("type,prompt,marks\nmcq,,1\nessay,Fine question here,0\nessay,Another fine one,5\nbogus,Hello there,1");
  assert.equal(r.questions.length, 1);
  assert.deepEqual(r.errors.map((e) => e.row), [2, 3, 5]);
  assert.match(r.errors[0].message, /Missing question text/);
  assert.match(r.errors[1].message, /Marks/);
  assert.equal(parseQuestionCsv("prompt\nx").errors[0].message, 'Missing required column "type".');
  assert.equal(parseQuestionCsv("type,prompt").errors.length, 1);
});

// ---------------------------------------------------------------- analytics
test("QZ077 item statistics: difficulty index, discrimination and flags", () => {
  const rows = Array.from({ length: 20 }, (_, i) => ({ total: i * 5, got: i >= 10 ? 1 : 0 })); // strong students get it right
  const s = itemStats(rows);
  assert.equal(s.difficultyIndex, 0.5);
  assert.equal(s.discrimination, 1);
  assert.equal(classifyItem(s.difficultyIndex, s.discrimination), "good");
  assert.equal(classifyItem(0.95, 0.5), "too_easy");
  assert.equal(classifyItem(0.1, 0.5), "too_hard");
  assert.equal(classifyItem(0.5, 0.0), "poor_discrimination");
  assert.equal(itemStats([]).difficultyIndex, null);
  assert.equal(itemStats([{ total: 1, got: 1 }]).discrimination, null, "too few attempts to discriminate");
  assert.equal(classifyItem(null, null), "insufficient_data");
  const inverted = itemStats(Array.from({ length: 20 }, (_, i) => ({ total: i * 5, got: i < 10 ? 1 : 0 })));
  assert.ok(inverted.discrimination! < 0, "a question weak students get right and strong students miss is flagged negative");
});

// ---------------------------------------------------------------- review
test("QZ027/028/029 review carries option feedback, explanations and marker comments", () => {
  const qs = [{ ...q({ id: "a", type: "mcq", correctAnswer: "x", options: ["x", "y"], config: { answerFeedback: { y: "Y confuses debit with credit" }, incorrectExplanation: "Debits increase assets." } }), prompt: "p", explanation: "Because." }];
  const items = buildReviewItems(qs, new Map([["a", { isCorrect: false, marksAwarded: 0, markerFeedback: "see notes" }]]), new Map([["a", "y"]]));
  assert.equal(items[0].answerFeedback, "Y confuses debit with credit");
  assert.equal(items[0].incorrectExplanation, "Debits increase assets.");
  assert.equal(items[0].explanation, "Because.");
  assert.equal(items[0].markerFeedback, "see notes");
  assert.equal(items[0].correctAnswer, "x");
  const right = buildReviewItems(qs, new Map([["a", { isCorrect: true, marksAwarded: 2 }]]), new Map([["a", "x"]]));
  assert.equal(right[0].incorrectExplanation, null, "no 'why wrong' text for a right answer");
});
