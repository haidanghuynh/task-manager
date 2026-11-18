-- AlterTable
ALTER TABLE "test_environments" ADD COLUMN "usageEndDate" DATETIME;

-- CreateTable
CREATE TABLE "test_environment_usages" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "environmentId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "startDate" DATETIME NOT NULL,
    "endDate" DATETIME NOT NULL,
    "registeredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "releasedAt" DATETIME,
    "releasedById" TEXT,
    "releaseReason" TEXT,
    CONSTRAINT "test_environment_usages_environmentId_fkey" FOREIGN KEY ("environmentId") REFERENCES "test_environments" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "test_environment_usages_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "test_environment_usages_releasedById_fkey" FOREIGN KEY ("releasedById") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "test_environment_usages_environmentId_registeredAt_idx" ON "test_environment_usages"("environmentId", "registeredAt");

-- CreateIndex
CREATE INDEX "test_environment_usages_employeeId_releasedAt_idx" ON "test_environment_usages"("employeeId", "releasedAt");

-- CreateIndex
CREATE INDEX "test_environment_usages_endDate_idx" ON "test_environment_usages"("endDate");

-- CreateIndex
CREATE INDEX "test_environments_usageEndDate_idx" ON "test_environments"("usageEndDate");
