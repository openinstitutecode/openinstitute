ALTER TABLE "SemesterConfig"
  ADD COLUMN "termWeeks" INTEGER NOT NULL DEFAULT 8,
  ADD COLUMN "maxCreditsPerTerm" INTEGER NOT NULL DEFAULT 24,
  ADD COLUMN "creditRate" INTEGER NOT NULL DEFAULT 300,
  ADD COLUMN "adminFee" DECIMAL(10,2) NOT NULL DEFAULT 1000;

ALTER TABLE "Enrollment"
  ADD COLUMN "courseId" TEXT,
  ADD COLUMN "creditsAtRegistration" INTEGER;

ALTER TABLE "Invoice"
  ADD COLUMN "termConfigId" TEXT;

CREATE TABLE "InvoiceLineItem" (
  "id" TEXT NOT NULL,
  "invoiceId" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL DEFAULT 1,
  "unitPrice" DECIMAL(10,2) NOT NULL,
  "amount" DECIMAL(10,2) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InvoiceLineItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Invoice_studentId_termConfigId_key"
  ON "Invoice"("studentId", "termConfigId");

CREATE INDEX "InvoiceLineItem_invoiceId_idx" ON "InvoiceLineItem"("invoiceId");
CREATE INDEX "Enrollment_courseId_idx" ON "Enrollment"("courseId");

ALTER TABLE "Enrollment"
  ADD CONSTRAINT "Enrollment_courseId_fkey"
  FOREIGN KEY ("courseId") REFERENCES "Course"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Invoice"
  ADD CONSTRAINT "Invoice_termConfigId_fkey"
  FOREIGN KEY ("termConfigId") REFERENCES "SemesterConfig"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "InvoiceLineItem"
  ADD CONSTRAINT "InvoiceLineItem_invoiceId_fkey"
  FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SemesterConfig"
  ADD CONSTRAINT "SemesterConfig_termWeeks_check" CHECK ("termWeeks" = 8),
  ADD CONSTRAINT "SemesterConfig_maxCreditsPerTerm_check" CHECK ("maxCreditsPerTerm" BETWEEN 24 AND 36),
  ADD CONSTRAINT "SemesterConfig_creditRate_check" CHECK ("creditRate" BETWEEN 300 AND 500);
