ALTER TABLE "tasks" ADD COLUMN "assignmentGroupId" TEXT;

CREATE INDEX "tasks_assignmentGroupId_idx" ON "tasks"("assignmentGroupId");
