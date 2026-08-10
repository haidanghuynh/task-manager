-- Mark the administrator created during installation so it cannot be removed
-- or demoted. For existing installations, the oldest Admin is the bootstrap
-- account because it was created before UI account management was available.
ALTER TABLE "users" ADD COLUMN "isPrimaryAdmin" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "users" ADD COLUMN "deletedAt" DATETIME;

UPDATE "users"
SET "isPrimaryAdmin" = true
WHERE "id" = (
  SELECT "id"
  FROM "users"
  WHERE "role" = 'ADMIN'
  ORDER BY "createdAt" ASC
  LIMIT 1
);

CREATE INDEX "users_deletedAt_idx" ON "users"("deletedAt");
