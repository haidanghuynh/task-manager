-- Task codes are business labels and may intentionally be reused.
DROP INDEX "tasks_taskCode_key";

-- Keep non-unique lookup performance for task list searches.
CREATE INDEX "tasks_taskCode_idx" ON "tasks"("taskCode");
