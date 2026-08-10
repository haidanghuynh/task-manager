-- The physical column remains named "email" for a zero-downtime Prisma field
-- mapping. Convert existing email-style login values only when their local part
-- is unique. Ambiguous values are preserved and can be renamed by an Admin.
UPDATE "users" AS "current_user"
SET "email" = lower(substr("current_user"."email", 1, instr("current_user"."email", '@') - 1))
WHERE instr("current_user"."email", '@') > 1
  AND (
    SELECT count(*)
    FROM "users" AS "candidate"
    WHERE lower(
      CASE
        WHEN instr("candidate"."email", '@') > 1
          THEN substr("candidate"."email", 1, instr("candidate"."email", '@') - 1)
        ELSE "candidate"."email"
      END
    ) = lower(substr("current_user"."email", 1, instr("current_user"."email", '@') - 1))
  ) = 1;
