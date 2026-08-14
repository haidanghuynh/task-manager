PRAGMA foreign_keys=OFF;

CREATE TABLE "new_tasks" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "taskCode" TEXT NOT NULL,
    "taskName" TEXT NOT NULL,
    "description" TEXT,
    "workType" TEXT NOT NULL DEFAULT 'PRODUCT',
    "dailyCategory" TEXT,
    "productId" TEXT,
    "currentAssigneeId" TEXT,
    "createdById" TEXT NOT NULL,
    "plannedStartDate" DATETIME NOT NULL,
    "plannedEndDate" DATETIME NOT NULL,
    "actualStartDate" DATETIME,
    "actualEndDate" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'PLANNED',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "priority" TEXT NOT NULL DEFAULT 'MEDIUM',
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    CONSTRAINT "tasks_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "tasks_currentAssigneeId_fkey" FOREIGN KEY ("currentAssigneeId") REFERENCES "employees" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "tasks_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

INSERT INTO "new_tasks" (
    "id", "taskCode", "taskName", "description", "productId", "currentAssigneeId",
    "createdById", "plannedStartDate", "plannedEndDate", "actualStartDate", "actualEndDate",
    "status", "progress", "priority", "note", "createdAt", "updatedAt", "deletedAt"
)
SELECT
    "id", "taskCode", "taskName", "description", "productId", "currentAssigneeId",
    "createdById", "plannedStartDate", "plannedEndDate", "actualStartDate", "actualEndDate",
    "status", "progress", "priority", "note", "createdAt", "updatedAt", "deletedAt"
FROM "tasks";

DROP TABLE "tasks";
ALTER TABLE "new_tasks" RENAME TO "tasks";

CREATE INDEX "tasks_productId_idx" ON "tasks"("productId");
CREATE INDEX "tasks_taskCode_idx" ON "tasks"("taskCode");
CREATE INDEX "tasks_currentAssigneeId_idx" ON "tasks"("currentAssigneeId");
CREATE INDEX "tasks_status_idx" ON "tasks"("status");
CREATE INDEX "tasks_plannedStartDate_plannedEndDate_idx" ON "tasks"("plannedStartDate", "plannedEndDate");
CREATE INDEX "tasks_deletedAt_idx" ON "tasks"("deletedAt");
CREATE INDEX "tasks_workType_idx" ON "tasks"("workType");

PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;
