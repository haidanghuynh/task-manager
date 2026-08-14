-- Existing managers with report access should also receive the new NIPPO workflow.
-- This is a one-time backfill; admins can still revoke these permissions afterward.
UPDATE "users"
SET "permissions" =
  substr("permissions", 1, length("permissions") - 1) ||
  CASE WHEN "permissions" = '[]' THEN '' ELSE ',' END ||
  '"NIPPO_VIEW","NIPPO_SUBMIT","NIPPO_MANAGE"]'
WHERE "role" = 'MANAGER'
  AND "deletedAt" IS NULL
  AND "permissions" IS NOT NULL
  AND "permissions" LIKE '%"REPORT_VIEW"%'
  AND "permissions" NOT LIKE '%"NIPPO_VIEW"%';
