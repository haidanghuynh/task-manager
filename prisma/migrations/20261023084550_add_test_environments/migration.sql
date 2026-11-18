-- CreateTable
CREATE TABLE "test_environments" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL DEFAULT 'PERSONAL',
    "productId" TEXT NOT NULL,
    "employeeId" TEXT,
    "usagePeriod" TEXT,
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

-- CreateIndex
CREATE INDEX "test_environments_type_idx" ON "test_environments"("type");

-- CreateIndex
CREATE INDEX "test_environments_productId_idx" ON "test_environments"("productId");

-- CreateIndex
CREATE INDEX "test_environments_employeeId_idx" ON "test_environments"("employeeId");
