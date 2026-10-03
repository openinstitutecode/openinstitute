// Batch 70 — KFEAT-030: distribution statistics for one assessment (percent scores in, plain numbers out).
export function scoreStats(percents: number[], passMark: number) {
  const xs = percents.filter((p) => Number.isFinite(p)).sort((a, b) => a - b);
  const n = xs.length;
  const r1 = (v: number) => Math.round(v * 10) / 10;
  const hist = Array.from({ length: 10 }, (_, i) => ({ from: i * 10, to: i === 9 ? 100 : i * 10 + 9.9, count: 0 }));
  if (!n) return { n: 0, mean: null, median: null, stdDev: null, min: null, max: null, q1: null, q3: null, passRatePercent: null, histogram: hist };
  const q = (p: number) => { const idx = (n - 1) * p, lo = Math.floor(idx), hi = Math.ceil(idx); return xs[lo] + (xs[hi] - xs[lo]) * (idx - lo); };
  const mean = xs.reduce((a, b) => a + b, 0) / n;
  const variance = n > 1 ? xs.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1) : 0;
  for (const x of xs) hist[Math.min(9, Math.max(0, Math.floor(x / 10)))].count++;
  return { n, mean: r1(mean), median: r1(q(0.5)), stdDev: r1(Math.sqrt(variance)), min: r1(xs[0]), max: r1(xs[n - 1]), q1: r1(q(0.25)), q3: r1(q(0.75)), passRatePercent: r1((xs.filter((x) => x >= passMark).length / n) * 100), histogram: hist };
}
