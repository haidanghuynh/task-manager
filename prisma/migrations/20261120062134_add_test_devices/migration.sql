-- CreateTable
CREATE TABLE "test_devices" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'LAPTOP',
    "purpose" TEXT,
    "os" TEXT,
    "serialNumber" TEXT,
    "location" TEXT,
    "note" TEXT,
    "status" TEXT NOT NULL DEFAULT 'AVAILABLE',
    "employeeId" TEXT,
    "usageStartDate" DATETIME,
    "usageEndDate" DATETIME,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "test_devices_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "test_devices_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "test_device_usages" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "deviceId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "startDate" DATETIME NOT NULL,
    "endDate" DATETIME NOT NULL,
    "checkedOutAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "returnedAt" DATETIME,
    "returnedById" TEXT,
    "returnCondition" TEXT,
    "note" TEXT,
    CONSTRAINT "test_device_usages_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "test_devices" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "test_device_usages_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "test_device_usages_returnedById_fkey" FOREIGN KEY ("returnedById") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "test_devices_code_key" ON "test_devices"("code");

-- CreateIndex
CREATE INDEX "test_devices_status_idx" ON "test_devices"("status");

-- CreateIndex
CREATE INDEX "test_devices_employeeId_idx" ON "test_devices"("employeeId");

-- CreateIndex
CREATE INDEX "test_devices_usageEndDate_idx" ON "test_devices"("usageEndDate");

-- CreateIndex
CREATE INDEX "test_device_usages_deviceId_checkedOutAt_idx" ON "test_device_usages"("deviceId", "checkedOutAt");

-- CreateIndex
CREATE INDEX "test_device_usages_employeeId_returnedAt_idx" ON "test_device_usages"("employeeId", "returnedAt");

-- CreateIndex
CREATE INDEX "test_device_usages_endDate_idx" ON "test_device_usages"("endDate");

-- Seed 3 thiết bị test hiện có. Admin có thể sửa serial/model/OS trên UI.
INSERT INTO "test_devices" ("id", "code", "name", "category", "purpose", "os", "serialNumber", "location", "note", "status", "employeeId", "usageStartDate", "usageEndDate", "isActive", "createdById", "createdAt", "updatedAt") VALUES
    ('dev_dell_burp_01', 'DELL-BURP-01', 'Dell test Burp Suite', 'LAPTOP', 'Burp Suite', 'Windows 11', NULL, NULL, NULL, 'AVAILABLE', NULL, NULL, NULL, true, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('dev_macbook_01', 'MACBOOK-01', 'MacBook test', 'LAPTOP', 'Test macOS/iOS', 'macOS', NULL, NULL, NULL, 'AVAILABLE', NULL, NULL, NULL, true, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('dev_phone_01', 'PHONE-01', 'Điện thoại test', 'PHONE', 'Test mobile', NULL, NULL, NULL, NULL, 'AVAILABLE', NULL, NULL, NULL, true, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
