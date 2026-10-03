// LB017 — citation generator. Pure formatting logic against whatever
// metadata a resource actually has; no AI involved and nothing invented —
// missing fields are simply omitted rather than guessed.

export type CitableResource = {
  title: string;
  author?: string | null;
  year?: number | null;
  url?: string | null;
};

export function toApaCitation(r: CitableResource): string {
  const authorPart = r.author ? `${r.author}. ` : "";
  const yearPart = r.year ? `(${r.year}). ` : "";
  const urlPart = r.url ? ` Retrieved from ${r.url}` : "";
  return `${authorPart}${yearPart}${r.title}.${urlPart}`.trim();
}

export function toMlaCitation(r: CitableResource): string {
  const authorPart = r.author ? `${r.author}. ` : "";
  const urlPart = r.url ? ` ${r.url}.` : "";
  const yearPart = r.year ? ` ${r.year}.` : "";
  return `${authorPart}"${r.title}."${yearPart}${urlPart}`.trim();
}
