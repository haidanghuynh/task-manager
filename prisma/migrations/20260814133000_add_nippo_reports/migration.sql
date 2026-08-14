CREATE TABLE "nippo_reports" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "reportDate" DATETIME NOT NULL,
    "employeeId" TEXT NOT NULL,
    "teamId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "summary" TEXT,
    "blockers" TEXT,
    "nextPlan" TEXT,
    "submittedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "nippo_reports_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "nippo_reports_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "nippo_items" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "reportId" TEXT NOT NULL,
    "taskId" TEXT,
    "title" TEXT NOT NULL,
    "workContent" TEXT,
    "result" TEXT,
    "hours" REAL NOT NULL DEFAULT 0,
    "progressBefore" INTEGER,
    "progressAfter" INTEGER,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "nippo_items_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "nippo_reports" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "nippo_items_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "nippo_absences" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "absenceDate" DATETIME NOT NULL,
    "teamId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "absenceType" TEXT NOT NULL DEFAULT 'PAID',
    "period" TEXT NOT NULL DEFAULT 'FULL',
    "reason" TEXT,
    "recordedById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "nippo_absences_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "nippo_absences_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "nippo_absences_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "nippo_reports_employeeId_reportDate_key" ON "nippo_reports"("employeeId", "reportDate");
CREATE INDEX "nippo_reports_reportDate_idx" ON "nippo_reports"("reportDate");
CREATE INDEX "nippo_reports_teamId_reportDate_idx" ON "nippo_reports"("teamId", "reportDate");
CREATE INDEX "nippo_items_reportId_idx" ON "nippo_items"("reportId");
CREATE INDEX "nippo_items_taskId_idx" ON "nippo_items"("taskId");
CREATE UNIQUE INDEX "nippo_absences_employeeId_absenceDate_key" ON "nippo_absences"("employeeId", "absenceDate");
CREATE INDEX "nippo_absences_teamId_absenceDate_idx" ON "nippo_absences"("teamId", "absenceDate");
