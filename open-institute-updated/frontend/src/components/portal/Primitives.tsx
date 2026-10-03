import { ReactNode } from "react";

export function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <div className="border border-line bg-white p-6">
      <p className="text-sm text-ink/55">{label}</p>
      <p className="mt-2 font-display text-3xl">{value}</p>
      {hint && <p className="mt-1 text-xs text-ink/45">{hint}</p>}
    </div>
  );
}

export function PortalSection({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="border border-line bg-white">
      <div className="flex items-center justify-between border-b border-line px-6 py-4">
        <h2 className="font-display text-lg">{title}</h2>
        {action}
      </div>
      <div className="p-6">{children}</div>
    </section>
  );
}

export function Table({
  columns,
  rows,
}: {
  columns: string[];
  rows: (string | ReactNode)[][];
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-line text-ink/50">
            {columns.map((c) => (
              <th key={c} className="pb-3 pr-4 font-medium">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((row, i) => (
            <tr key={i}>
              {row.map((cell, j) => (
                <td key={j} className="py-3 pr-4">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Badge({ tone, children }: { tone: "ok" | "warn" | "danger" | "neutral"; children: ReactNode }) {
  const tones: Record<string, string> = {
    ok: "bg-forest/10 text-forest",
    warn: "bg-gold/15 text-gold-dark",
    danger: "bg-red-100 text-red-700",
    neutral: "bg-ink/5 text-ink/60",
  };
  return (
    <span className={`inline-flex items-center rounded-sm px-2 py-1 font-mono text-xs uppercase tracking-wide ${tones[tone]}`}>
      {children}
    </span>
  );
}
