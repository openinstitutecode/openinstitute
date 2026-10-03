import { prisma } from "../prisma.js";
import type { LibraryResource } from "@prisma/client";

// LB004 — real full-text search against the internal catalogue.
//
// Batch 58's audit was accurate: LibraryResource had no content field, so
// the only genuine full-text search in the system was CORE's external API.
// This batch adds an optional `content` column (a librarian-pasted
// abstract/excerpt — see AdminLibraryAdmin.tsx) and, when a query is
// given, searches title/author/subject/content together using Postgres's
// own text-search engine (to_tsvector/plainto_tsquery + ts_rank), not a
// second layer of `contains` on top of `contains`. Resources with no
// content still only match on title/author/subject, exactly as before —
// this never claims to have indexed a body of text that isn't there.
export async function searchInternalCatalogue(
  query: string,
  limit = 20
): Promise<LibraryResource[]> {
  const q = query.trim();
  if (!q) {
    return prisma.libraryResource.findMany({ orderBy: { addedAt: "desc" }, take: limit });
  }

  // $queryRaw is used here (rather than Prisma's `contains` filter) because
  // Prisma has no native mapping for Postgres tsvector/tsquery ranking.
  // Every value is passed as a bound parameter, never string-interpolated,
  // so this carries the same injection safety as Prisma's query builder.
  const rows = await prisma.$queryRaw<LibraryResource[]>`
    SELECT * FROM "LibraryResource"
    WHERE
      to_tsvector('english',
        coalesce(title, '') || ' ' || coalesce(author, '') || ' ' ||
        coalesce(subject, '') || ' ' || coalesce(content, '')
      ) @@ plainto_tsquery('english', ${q})
      OR title ILIKE ${"%" + q + "%"}
      OR author ILIKE ${"%" + q + "%"}
      OR subject ILIKE ${"%" + q + "%"}
    ORDER BY
      ts_rank(
        to_tsvector('english',
          coalesce(title, '') || ' ' || coalesce(author, '') || ' ' ||
          coalesce(subject, '') || ' ' || coalesce(content, '')
        ),
        plainto_tsquery('english', ${q})
      ) DESC,
      "addedAt" DESC
    LIMIT ${limit}
  `;
  return rows;
}
