// Batch 68 — small pure helpers behind the quick-win endpoints (no DB, no Express).
import { createHmac } from "node:crypto";

const num = (v: unknown) => Number(v ?? 0);
const round2 = (n: number) => Math.round(n * 100) / 100;

// KFEAT-043 — statement rows (charges and payments in date order) with a running balance.
export type StatementInvoice = { id: string; semester: string; amountDue: unknown; dueDate: Date; createdAt: Date; payments: { id: string; amount: unknown; method: string; reference: string; paidAt: Date; reversedAt?: Date | null }[] };
export function buildStatement(invoices: StatementInvoice[]) {
  const rows: { date: Date; type: "charge" | "payment"; description: string; debit: number; credit: number }[] = [];
  for (const inv of invoices) {
    rows.push({ date: inv.createdAt, type: "charge", description: `Fees ${inv.semester}`, debit: num(inv.amountDue), credit: 0 });
    for (const p of inv.payments) {
      if (p.reversedAt) continue; // reversed payments no longer reduce the balance
      rows.push({ date: p.paidAt, type: "payment", description: `Payment ${p.method} ${p.reference}`, debit: 0, credit: num(p.amount) });
    }
  }
  rows.sort((a, b) => a.date.getTime() - b.date.getTime() || (a.type === "charge" ? -1 : 1));
  let balance = 0;
  const lines = rows.map((r) => { balance = round2(balance + r.debit - r.credit); return { ...r, date: r.date.toISOString(), balance }; });
  return { lines, totalCharged: round2(rows.reduce((a, r) => a + r.debit, 0)), totalPaid: round2(rows.reduce((a, r) => a + r.credit, 0)), balance };
}

// KFEAT-041 / KFEAT-050 — classify invoices for the fee-account view and reminder runs.
export function classifyInvoice(inv: { amountDue: unknown; amountPaid: unknown; dueDate: Date }, now = new Date(), soonDays = 7) {
  const outstanding = round2(num(inv.amountDue) - num(inv.amountPaid));
  if (outstanding <= 0) return { outstanding: 0, bucket: "settled" as const };
  const days = Math.ceil((inv.dueDate.getTime() - now.getTime()) / 86_400_000);
  if (days < 0) return { outstanding, bucket: "overdue" as const, daysOverdue: -days };
  if (days <= soonDays) return { outstanding, bucket: "due_soon" as const, daysUntilDue: days };
  return { outstanding, bucket: "upcoming" as const, daysUntilDue: days };
}

// KFEAT-115 — active placements with no logbook entry submitted in the last `days` days.
export function staleLogbooks<T extends { id: string; startDate: Date; logbookEntries: { submittedAt: Date }[] }>(placements: T[], now = new Date(), days = 8) {
  const cutoff = now.getTime() - days * 86_400_000;
  return placements.filter((p) => {
    if (p.startDate.getTime() > cutoff) return false; // hasn't been running long enough to owe an entry
    const last = Math.max(0, ...p.logbookEntries.map((e) => e.submittedAt.getTime()));
    return last < cutoff;
  });
}

// KDATA-010 — stable, non-reversible id for research/analytics exports.
export function pseudonymise(id: string, secret: string) {
  return "p_" + createHmac("sha256", secret).update(id).digest("hex").slice(0, 16);
}

// KFEAT-009 — iCalendar export.
const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
const fold = (line: string) => { const out: string[] = []; let l = line; while (l.length > 73) { out.push(l.slice(0, 73)); l = " " + l.slice(73); } out.push(l); return out.join("\r\n"); };
const pad = (n: number) => String(n).padStart(2, "0");
const utcStamp = (d: Date) => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
const dateOnly = (d: Date) => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`;
const BYDAY = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

export type IcsTimetable = { uid: string; title: string; dayOfWeek: number; startTime: string; endTime: string; mode?: string };
export type IcsDayEvent = { uid: string; title: string; startDate: Date; endDate: Date; description?: string | null };
export function buildIcs(opts: { name: string; timetable: IcsTimetable[]; events: IcsDayEvent[]; from?: Date; weeks?: number; now?: Date }) {
  const now = opts.now ?? new Date();
  const from = opts.from ?? now;
  const weeks = opts.weeks ?? 16;
  const L: string[] = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Measur Business College//Student Calendar//EN", "CALSCALE:GREGORIAN", `X-WR-CALNAME:${esc(opts.name)}`, "X-WR-TIMEZONE:Africa/Nairobi"];
  for (const t of opts.timetable) {
    if (!/^\d{2}:\d{2}$/.test(t.startTime) || !/^\d{2}:\d{2}$/.test(t.endTime)) continue;
    const first = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
    first.setUTCDate(first.getUTCDate() + ((t.dayOfWeek - first.getUTCDay() + 7) % 7));
    const ds = dateOnly(first);
    const until = new Date(first.getTime() + weeks * 7 * 86_400_000);
    L.push("BEGIN:VEVENT", `UID:${t.uid}@kvbdtc`, `DTSTAMP:${utcStamp(now)}`,
      `DTSTART;TZID=Africa/Nairobi:${ds}T${t.startTime.replace(":", "")}00`, `DTEND;TZID=Africa/Nairobi:${ds}T${t.endTime.replace(":", "")}00`,
      `RRULE:FREQ=WEEKLY;BYDAY=${BYDAY[t.dayOfWeek]};UNTIL=${dateOnly(until)}T235959Z`, fold(`SUMMARY:${esc(t.title)}${t.mode === "recorded_release" ? " (recorded release)" : ""}`), "END:VEVENT");
  }
  for (const e of opts.events) {
    const endExclusive = new Date(e.endDate.getTime() + 86_400_000); // all-day DTEND is exclusive
    L.push("BEGIN:VEVENT", `UID:${e.uid}@kvbdtc`, `DTSTAMP:${utcStamp(now)}`, `DTSTART;VALUE=DATE:${dateOnly(e.startDate)}`, `DTEND;VALUE=DATE:${dateOnly(endExclusive)}`, fold(`SUMMARY:${esc(e.title)}`));
    if (e.description) L.push(fold(`DESCRIPTION:${esc(e.description)}`));
    L.push("END:VEVENT");
  }
  L.push("END:VCALENDAR");
  return L.join("\r\n") + "\r\n";
}

// KFEAT-060 — retention figures from status counts. Graduates completed the programme, so they are left out of the base.
export function retentionSummary(counts: Record<string, number>) {
  const total = Object.entries(counts).filter(([k]) => k !== "GRADUATED").reduce((a, [, n]) => a + n, 0);
  const lost = (counts.WITHDRAWN ?? 0) + (counts.EXCLUDED ?? 0);
  const pct = (n: number) => (total ? Math.round((n / total) * 1000) / 10 : 0);
  return { total, lost, retentionPercent: total ? pct(total - lost) : 0, attritionPercent: pct(lost), graduated: counts.GRADUATED ?? 0 };
}

// Batch 69 — KFEAT-007: totals per calendar week (Monday start, UTC), oldest first, empty weeks included.
export function weekBuckets(items: { at: Date; value: number }[], weeks = 8, now = new Date()) {
  const monday = (d: Date) => { const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())); x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7)); return x; };
  const start = monday(now); start.setUTCDate(start.getUTCDate() - (weeks - 1) * 7);
  const out = Array.from({ length: weeks }, (_, i) => ({ weekStart: new Date(start.getTime() + i * 7 * 86_400_000).toISOString().slice(0, 10), total: 0 }));
  for (const it of items) { const idx = Math.floor((monday(it.at).getTime() - start.getTime()) / (7 * 86_400_000)); if (idx >= 0 && idx < weeks) out[idx].total += it.value; }
  return out;
}
export const mondayKey = (d: Date) => { const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())); x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7)); return x.toISOString().slice(0, 10); };
