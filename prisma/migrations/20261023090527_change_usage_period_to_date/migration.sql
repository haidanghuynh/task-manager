/*
  Warnings:

  - You are about to alter the column `usagePeriod` on the `test_environments` table. The data in that column could be lost. The data in that column will be cast from `String` to `DateTime`.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_test_environments" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL DEFAULT 'PERSONAL',
    "productId" TEXT NOT NULL,
    "employeeId" TEXT,
    "usagePeriod" DATETIME,
    "os" TEXT,
    "setupType" TEXT NOT NULL DEFAULT 'NEW',
    "virus" TEXT,
    "hostName" TEXT,
    "ip" TEXT,
    "url" TEXT,
    "deliveryDomain" TEXT,
    "version" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "test_environments_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "test_environments_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "test_environments_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_test_environments" ("createdAt", "createdById", "deliveryDomain", "employeeId", "hostName", "id", "ip", "isActive", "os", "productId", "setupType", "type", "updatedAt", "url", "usagePeriod", "version", "virus") SELECT "createdAt", "createdById", "deliveryDomain", "employeeId", "hostName", "id", "ip", "isActive", "os", "productId", "setupType", "type", "updatedAt", "url", "usagePeriod", "version", "virus" FROM "test_environments";
DROP TABLE "test_environments";
ALTER TABLE "new_test_environments" RENAME TO "test_environments";
CREATE INDEX "test_environments_type_idx" ON "test_environments"("type");
CREATE INDEX "test_environments_productId_idx" ON "test_environments"("productId");
CREATE INDEX "test_environments_employeeId_idx" ON "test_environments"("employeeId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
