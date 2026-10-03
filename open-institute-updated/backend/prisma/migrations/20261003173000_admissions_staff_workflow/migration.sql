ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Application"
  ADD COLUMN IF NOT EXISTS "temporaryPasswordHash" TEXT,
  ADD COLUMN IF NOT EXISTS "portraitPhotoUrl" TEXT;

ALTER TABLE "Student"
  ADD COLUMN IF NOT EXISTS "cardId" TEXT,
  ADD COLUMN IF NOT EXISTS "applicationId" TEXT;

UPDATE "Student"
SET "cardId" = 'DID-' || upper(substr(md5("id"), 1, 12))
WHERE "cardId" IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "Student_cardId_key" ON "Student"("cardId");
CREATE UNIQUE INDEX IF NOT EXISTS "Student_applicationId_key" ON "Student"("applicationId");
ALTER TABLE "Student" ALTER COLUMN "cardId" SET NOT NULL;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'Student_applicationId_fkey'
      AND conrelid = '"Student"'::regclass
  ) THEN
    ALTER TABLE "Student"
      ADD CONSTRAINT "Student_applicationId_fkey"
      FOREIGN KEY ("applicationId") REFERENCES "Application"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

ALTER TABLE "StaffProfile"
  ADD COLUMN IF NOT EXISTS "staffNumber" TEXT,
  ADD COLUMN IF NOT EXISTS "photoUrl" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "StaffProfile_staffNumber_key" ON "StaffProfile"("staffNumber");

ALTER TABLE "Trainer"
  ADD COLUMN IF NOT EXISTS "staffNumber" TEXT,
  ADD COLUMN IF NOT EXISTS "photoUrl" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "Trainer_staffNumber_key" ON "Trainer"("staffNumber");

ALTER TABLE "Document"
  ADD COLUMN IF NOT EXISTS "storageKey" TEXT,
  ADD COLUMN IF NOT EXISTS "mimeType" TEXT,
  ADD COLUMN IF NOT EXISTS "originalName" TEXT;

CREATE TABLE IF NOT EXISTS "IdSequence" (
  "name" TEXT NOT NULL,
  "value" INTEGER NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "IdSequence_pkey" PRIMARY KEY ("name")
);

WITH profiles AS (
  SELECT "id", 'staff' AS "profileType" FROM "StaffProfile"
  UNION ALL
  SELECT "id", 'trainer' AS "profileType" FROM "Trainer"
), numbered AS (
  SELECT profiles."id", profiles."profileType",
         row_number() OVER (ORDER BY profiles."profileType", profiles."id") AS "sequence"
  FROM profiles
)
UPDATE "StaffProfile" AS profile
SET "staffNumber" = 'STF-LEGACY-' || lpad(numbered."sequence"::text, 6, '0')
FROM numbered
WHERE numbered."profileType" = 'staff'
  AND numbered."id" = profile."id";

WITH profiles AS (
  SELECT "id", 'staff' AS "profileType" FROM "StaffProfile"
  UNION ALL
  SELECT "id", 'trainer' AS "profileType" FROM "Trainer"
), numbered AS (
  SELECT profiles."id", profiles."profileType",
         row_number() OVER (ORDER BY profiles."profileType", profiles."id") AS "sequence"
  FROM profiles
)
UPDATE "Trainer" AS profile
SET "staffNumber" = 'STF-LEGACY-' || lpad(numbered."sequence"::text, 6, '0')
FROM numbered
WHERE numbered."profileType" = 'trainer'
  AND numbered."id" = profile."id";
