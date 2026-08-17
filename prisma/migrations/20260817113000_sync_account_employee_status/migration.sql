-- Keep the linked employee visibility in sync with the account status for existing data.
UPDATE "employees"
SET "isActive" = (
  SELECT "users"."isActive"
  FROM "users"
  WHERE "users"."employeeId" = "employees"."id"
    AND "users"."deletedAt" IS NULL
)
WHERE EXISTS (
  SELECT 1
  FROM "users"
  WHERE "users"."employeeId" = "employees"."id"
    AND "users"."deletedAt" IS NULL
);
