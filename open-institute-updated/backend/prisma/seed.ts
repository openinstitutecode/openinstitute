import "dotenv/config";
import { PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const programmes = [
    {
      slug: "diploma-business-management",
      name: "Diploma in Business Management",
      qualificationLevel: "TVET Level 6 Diploma",
      durationSemesters: 4,
      deliveryMode: "Fully virtual, with practicum",
      requiresAttachment: true,
      units: [
        "Principles of Management",
        "Business Communication",
        "Financial Accounting",
        "Entrepreneurship",
      ],
    },
    {
      slug: "certificate-digital-marketing",
      name: "Certificate in Digital Marketing",
      qualificationLevel: "TVET Level 5 Certificate",
      durationSemesters: 2,
      deliveryMode: "Fully virtual",
      requiresAttachment: false,
      units: ["Digital Marketing Foundations", "Social Media Strategy", "SEO"],
    },
    {
      slug: "diploma-accounting-finance",
      name: "Diploma in Accounting & Finance",
      qualificationLevel: "TVET Level 6 Diploma",
      durationSemesters: 4,
      deliveryMode: "Fully virtual, with practicum",
      requiresAttachment: true,
      units: ["Financial Accounting I", "Cost Accounting", "Taxation"],
    },
    {
      slug: "certificate-office-digital-skills",
      name: "Certificate in Office & Digital Skills",
      qualificationLevel: "TVET Level 4 Certificate",
      durationSemesters: 1,
      deliveryMode: "Fully virtual",
      requiresAttachment: false,
      units: ["Computer Applications", "Business Communication", "Digital Literacy"],
    },
  ];

  for (const p of programmes) {
    await prisma.programme.upsert({
      where: { slug: p.slug },
      update: {},
      create: {
        slug: p.slug,
        name: p.name,
        qualificationLevel: p.qualificationLevel,
        durationSemesters: p.durationSemesters,
        deliveryMode: p.deliveryMode,
        requiresAttachment: p.requiresAttachment,
        units: {
          create: p.units.map((title, i) => ({
            code: `${p.slug.slice(0, 3).toUpperCase()}${100 + i}`,
            title,
            semester: 1,
            learningOutcomes: [],
          })),
        },
      },
    });
  }

  const seedAdminEmail = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
  const seedAdminPassword = process.env.SEED_ADMIN_PASSWORD;
  if (!seedAdminEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(seedAdminEmail)) {
    throw new Error("Set a valid SEED_ADMIN_EMAIL before running the database seed.");
  }
  if (!seedAdminPassword || seedAdminPassword.length < 8) {
    throw new Error("Set SEED_ADMIN_PASSWORD to at least 8 characters before running the database seed.");
  }
  const adminPassword = await bcrypt.hash(seedAdminPassword, 10);
  await prisma.user.upsert({
    where: { email: seedAdminEmail },
    update: {},
    create: {
      email: seedAdminEmail,
      passwordHash: adminPassword,
      role: Role.SUPER_ADMIN,
    },
  });

  const complianceRows = [
    { regulator: "TVETA", requirement: "Institutional registration" },
    { regulator: "TVETA", requirement: "ODeL delivery approval" },
    { regulator: "KUCCPS", requirement: "Institution listing" },
    { regulator: "ODPC", requirement: "Data controller/processor registration" },
  ];
  for (const row of complianceRows) {
    const existing = await prisma.complianceRequirement.findFirst({
      where: { regulator: row.regulator, requirement: row.requirement },
    });
    if (!existing) {
      await prisma.complianceRequirement.create({
        data: { ...row, status: "pending" },
      });
    }
  }

  const libraryResources = [
    {
      title: "Principles of Managerial Finance (OER edition)",
      author: "Open Textbook Library",
      type: "ebook",
      subject: "Finance",
      externalUrl: "https://open.umn.edu/opentextbooks",
      licence: "open",
    },
    {
      title: "Kenya Gazette — TVET Act Subsidiary Legislation",
      author: "Government of Kenya",
      type: "government_doc",
      subject: "Policy",
      externalUrl: "http://kenyalaw.org",
      licence: "open",
    },
  ];
  for (const r of libraryResources) {
    const existing = await prisma.libraryResource.findFirst({ where: { title: r.title } });
    if (!existing) {
      await prisma.libraryResource.create({ data: r });
    }
  }

  console.log("Seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
