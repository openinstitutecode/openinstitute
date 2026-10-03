ALTER TABLE "User"
  ADD COLUMN "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Application"
  ADD COLUMN "temporaryPasswordHash" TEXT,
  ADD COLUMN "portraitPhotoUrl" TEXT;

ALTER TABLE "Student"
  ADD COLUMN "cardId" TEXT,
  ADD COLUMN "applicationId" TEXT;

UPDATE "Student"
SET "cardId" = 'DID-' || upper(substr(md5("id"), 1, 12))
WHERE "cardId" IS NULL;

CREATE UNIQUE INDEX "Student_cardId_key" ON "Student"("cardId");
CREATE UNIQUE INDEX "Student_applicationId_key" ON "Student"("applicationId");
ALTER TABLE "Student" ALTER COLUMN "cardId" SET NOT NULL;
ALTER TABLE "Student"
  ADD CONSTRAINT "Student_applicationId_fkey"
  FOREIGN KEY ("applicationId") REFERENCES "Application"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "StaffProfile"
  ADD COLUMN "staffNumber" TEXT,
  ADD COLUMN "photoUrl" TEXT;
CREATE UNIQUE INDEX "StaffProfile_staffNumber_key" ON "StaffProfile"("staffNumber");

ALTER TABLE "Trainer"
  ADD COLUMN "staffNumber" TEXT,
  ADD COLUMN "photoUrl" TEXT;
CREATE UNIQUE INDEX "Trainer_staffNumber_key" ON "Trainer"("staffNumber");

ALTER TABLE "Document"
  ADD COLUMN "storageKey" TEXT,
  ADD COLUMN "mimeType" TEXT,
  ADD COLUMN "originalName" TEXT;

CREATE TABLE "IdSequence" (
  "name" TEXT NOT NULL,
  "value" INTEGER NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "IdSequence_pkey" PRIMARY KEY ("name")
);

WITH profiles AS (
  SELECT "id", "createdAt", 'staff' AS "profileType" FROM "StaffProfile"
  UNION ALL
  SELECT "id", "createdAt", 'trainer' AS "profileType" FROM "Trainer"
), numbered AS (
  SELECT "id", "profileType", row_number() OVER (ORDER BY "createdAt", "id") AS "sequence"
  FROM profiles
)
UPDATE "StaffProfile" AS profile
SET "staffNumber" = 'STF-LEGACY-' || lpad(numbered."sequence"::text, 6, '0')
FROM numbered
WHERE numbered."profileType" = 'staff'
  AND numbered."id" = profile."id";

WITH profiles AS (
  SELECT "id", "createdAt", 'staff' AS "profileType" FROM "StaffProfile"
  UNION ALL
  SELECT "id", "createdAt", 'trainer' AS "profileType" FROM "Trainer"
), numbered AS (
  SELECT "id", "profileType", row_number() OVER (ORDER BY "createdAt", "id") AS "sequence"
  FROM profiles
)
UPDATE "Trainer" AS profile
SET "staffNumber" = 'STF-LEGACY-' || lpad(numbered."sequence"::text, 6, '0')
FROM numbered
WHERE numbered."profileType" = 'trainer'
  AND numbered."id" = profile."id";
