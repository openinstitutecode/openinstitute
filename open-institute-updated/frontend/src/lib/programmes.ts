export type Programme = {
  slug: string;
  name: string;
  level: string;
  duration: string;
  mode: string;
  summary: string;
  units: string[];
  outcomes: string[];
};

export const programmes: Programme[] = [
  {
    slug: "diploma-business-management",
    name: "Diploma in Business Management",
    level: "Diploma (TVET Level 6)",
    duration: "2 years, 4 semesters",
    mode: "Fully virtual, with practicum",
    summary:
      "Core business functions — finance, marketing, HR, and operations — taught through case studies drawn from Kenyan enterprises, with a supervised industrial attachment.",
    units: [
      "Principles of Management",
      "Business Communication",
      "Financial Accounting",
      "Entrepreneurship",
      "Marketing Management",
      "Business Law",
      "Human Resource Management",
      "Industrial Attachment",
    ],
    outcomes: [
      "Plan and run core functions of a small-to-medium enterprise",
      "Prepare and interpret basic financial statements",
      "Design a viable business plan and pitch it to financiers",
    ],
  },
  {
    slug: "certificate-digital-marketing",
    name: "Certificate in Digital Marketing",
    level: "Certificate (TVET Level 5)",
    duration: "1 year, 2 semesters",
    mode: "Fully virtual",
    summary:
      "Practical digital marketing for Kenyan SMEs and agencies — social media, SEO, content, and analytics, taught through live campaigns rather than theory alone.",
    units: [
      "Digital Marketing Foundations",
      "Social Media Strategy",
      "Search Engine Optimisation",
      "Content Creation",
      "Marketing Analytics",
      "Capstone Campaign Project",
    ],
    outcomes: [
      "Plan and run a multi-channel digital campaign end to end",
      "Read and act on campaign analytics",
      "Build a portfolio of live campaign work",
    ],
  },
  {
    slug: "diploma-accounting-finance",
    name: "Diploma in Accounting & Finance",
    level: "Diploma (TVET Level 6)",
    duration: "2 years, 4 semesters",
    mode: "Fully virtual, with practicum",
    summary:
      "A practice-first accounting diploma covering bookkeeping through management accounting, with simulated ledgers and audit exercises.",
    units: [
      "Financial Accounting I & II",
      "Cost Accounting",
      "Taxation",
      "Auditing Principles",
      "Management Accounting",
      "Industrial Attachment",
    ],
    outcomes: [
      "Maintain a full set of books for a small business",
      "Prepare statutory tax computations",
      "Support an internal or external audit process",
    ],
  },
  {
    slug: "certificate-office-digital-skills",
    name: "Certificate in Office & Digital Skills",
    level: "Certificate (TVET Level 4)",
    duration: "6 months",
    mode: "Fully virtual",
    summary:
      "An entry-level bridge programme for learners moving from secondary school into business or digital study — practical office software, email and communication, and foundational digital literacy.",
    units: [
      "Computer Applications",
      "Business Communication",
      "Digital Literacy",
      "Records Management",
    ],
    outcomes: [
      "Operate common office and cloud productivity tools confidently",
      "Communicate professionally in a Kenyan workplace context",
    ],
  },
];

export function getProgrammeBySlug(slug: string) {
  return programmes.find((p) => p.slug === slug);
}
