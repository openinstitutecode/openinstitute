// Batch 69 — KFEAT-059: KPI values compared with admin-configured targets.
export type KpiDef = { key: string; label: string; direction: "min" | "max"; unit: "%" | "count" };
export const KPI_DEFS: KpiDef[] = [
  { key: "collectionRatePercent", label: "Fee collection rate", direction: "min", unit: "%" },
  { key: "retentionPercent", label: "Student retention", direction: "min", unit: "%" },
  { key: "passRatePercent", label: "Assessment pass rate", direction: "min", unit: "%" },
  { key: "maxOpenTickets", label: "Unresolved support tickets", direction: "max", unit: "count" },
];
export function kpiStatus(value: number | null, target: number, direction: "min" | "max"): "ok" | "warn" | "bad" | "unknown" {
  if (value === null || !Number.isFinite(value)) return "unknown";
  if (direction === "min") return value >= target ? "ok" : value >= target * 0.9 ? "warn" : "bad";
  return value <= target ? "ok" : value <= target * 1.25 ? "warn" : "bad";
}
export function evaluateKpis(values: Record<string, number | null>, targets: Record<string, number>) {
  return KPI_DEFS.map((d) => ({ ...d, value: values[d.key] ?? null, target: targets[d.key], status: kpiStatus(values[d.key] ?? null, targets[d.key], d.direction) }));
}
