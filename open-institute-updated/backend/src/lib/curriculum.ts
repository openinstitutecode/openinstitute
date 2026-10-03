// Minimal curriculum knowledge base standing in for a real curriculum
// knowledge graph. In production this is populated from Unit/Lesson content
// that a trainer has authored and QA has approved — never invented by the AI.
// Each entry is what the AI tutor is allowed to draw from for that unit.
//
// Batch 45 (AI006): this static array is now the FALLBACK, not the only
// source — see getKnowledgeBaseTopics() below for the real, database-backed,
// QA-approved knowledge base that ai.ts prefers when a unit has entries.
import { prisma } from "./prisma.js";

export type CurriculumEntry = {
  unit: string;
  topics: { title: string; summary: string; sourceRef: string }[];
};

export const curriculum: CurriculumEntry[] = [
  {
    unit: "Financial Accounting",
    topics: [
      {
        title: "The accounting equation",
        summary:
          "Assets = Liabilities + Owner's Equity. Every transaction keeps this equation in balance; that's the basis of double-entry bookkeeping.",
        sourceRef: "Financial Accounting — Module 1, Lesson 1",
      },
      {
        title: "Double-entry bookkeeping",
        summary:
          "Every transaction is recorded as a debit in one account and an equal credit in another, so the books always balance.",
        sourceRef: "Financial Accounting — Module 1, Lesson 2",
      },
      {
        title: "Trial balance",
        summary:
          "A list of all ledger balances at a point in time, used to check that total debits equal total credits before preparing financial statements.",
        sourceRef: "Financial Accounting — Module 2, Lesson 2",
      },
    ],
  },
  {
    unit: "Entrepreneurship",
    topics: [
      {
        title: "Business plan structure",
        summary:
          "A business plan typically covers the opportunity, the market, the operating model, the team, and the financial projections a funder will scrutinise first.",
        sourceRef: "Entrepreneurship — Module 3, Lesson 1",
      },
    ],
  },
  {
    unit: "Business Law",
    topics: [
      {
        title: "Elements of a valid contract",
        summary:
          "Offer, acceptance, consideration, intention to create legal relations, and capacity to contract.",
        sourceRef: "Business Law — Module 1, Lesson 1",
      },
    ],
  },
  {
    unit: "Marketing Management",
    topics: [
      {
        title: "The marketing mix (4Ps)",
        summary:
          "Product, Price, Place, and Promotion — the levers a business adjusts to reach and satisfy its target market.",
        sourceRef: "Marketing Management — Module 1, Lesson 1",
      },
    ],
  },
];

export function findRelevantTopics(unit: string, question: string) {
  const entry = curriculum.find((c) => c.unit.toLowerCase() === unit.toLowerCase());
  if (!entry) return [];
  const q = question.toLowerCase();
  const matches = entry.topics.filter(
    (t) =>
      q.includes(t.title.toLowerCase()) ||
      t.title.toLowerCase().split(" ").some((w) => w.length > 4 && q.includes(w))
  );
  return matches.length > 0 ? matches : entry.topics.slice(0, 2);
}

// AI006 — Managed knowledge base lookup. Same shape as findRelevantTopics
// (title/summary/sourceRef) so ai.ts can use either interchangeably, but
// sourced from the real, QA-approved KnowledgeBaseEntry table instead of
// this file's hardcoded array. Only ever returns isApproved rows — a
// trainer's draft entry is not something the tutor can cite yet.
export async function getKnowledgeBaseTopics(
  unitName: string,
  question: string
): Promise<{ title: string; summary: string; sourceRef: string }[]> {
  const unit = await prisma.unit.findFirst({
    where: { title: { equals: unitName, mode: "insensitive" } },
    select: { id: true },
  });
  if (!unit) return [];

  const entries = await prisma.knowledgeBaseEntry.findMany({
    where: { unitId: unit.id, isApproved: true },
    select: { title: true, summary: true, sourceRef: true },
  });
  if (entries.length === 0) return [];

  const q = question.toLowerCase();
  const matches = entries.filter(
    (t) =>
      q.includes(t.title.toLowerCase()) ||
      t.title.toLowerCase().split(" ").some((w) => w.length > 4 && q.includes(w))
  );
  return matches.length > 0 ? matches : entries.slice(0, 2);
}
