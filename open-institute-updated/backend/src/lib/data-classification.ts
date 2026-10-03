// KDATA-001 — classify every Prisma model field as personal / sensitive-personal / academic /
// financial / operational / credential. Derived from the live schema (Prisma.dmmf) with name rules,
// so new fields are classified automatically instead of a hand-kept list going stale.
export type DataClass = "credential" | "sensitive_personal" | "personal" | "financial" | "academic" | "operational";

const RULES: [DataClass, RegExp][] = [
  ["credential", /password|hash|secret|token|apikey|api_key|signature/i],
  ["sensitive_personal", /nationalid|idnumber|passport|birth|dob|disab|medical|health|counsel|wellbeing|religion|ethnic|gender|photo|biometric|emergencycontact/i],
  ["personal", /email|phone|fullname|firstname|lastname|address|guardian|nextofkin|^name$/i],
  ["financial", /amount|balance|fees?(?!d)|payment|invoice|refund|salary|price|cost|budget|paid|due|mpesa|card|receipt/i],
  ["academic", /score|grade|mark|result|gpa|transcript|competen|attendance|academic|feedback|verdict|rubric/i],
];
const MODEL_OVERRIDES: [RegExp, DataClass][] = [
  [/^(Counselling|Wellbeing|Accommodation)/, "sensitive_personal"],
  [/^(Payment|Invoice|Receipt|Refund|Ledger|Budget|Scholarship|Installment|FeeStructure)/, "financial"],
  [/^(AuditLog|FailedLoginAttempt|Integration|AiUsageLog)/, "operational"],
];

export function classifyField(model: string, field: string): DataClass {
  for (const [cls, re] of RULES) if (re.test(field)) return cls;
  for (const [re, cls] of MODEL_OVERRIDES) if (re.test(model)) return cls;
  return "operational";
}

export type ClassifiedModel = { model: string; fields: { field: string; class: DataClass }[]; highestSensitivity: DataClass };
const ORDER: DataClass[] = ["credential", "sensitive_personal", "financial", "personal", "academic", "operational"];

export function classifyModels(models: { name: string; fields: { name: string; kind: string }[] }[]): ClassifiedModel[] {
  return models.map((m) => {
    const fields = m.fields.filter((f) => f.kind !== "object").map((f) => ({ field: f.name, class: classifyField(m.name, f.name) }));
    const highest = ORDER.find((c) => fields.some((f) => f.class === c)) ?? "operational";
    return { model: m.name, fields, highestSensitivity: highest };
  });
}
