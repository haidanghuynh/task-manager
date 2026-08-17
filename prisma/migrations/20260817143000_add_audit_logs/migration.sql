CREATE TABLE "audit_logs" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "actorId" TEXT,
  "actorName" TEXT NOT NULL,
  "actorUsername" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "entityType" TEXT NOT NULL,
  "entityId" TEXT,
  "entityLabel" TEXT,
  "details" TEXT,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "audit_logs_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");
CREATE INDEX "audit_logs_actorId_createdAt_idx" ON "audit_logs"("actorId", "createdAt");
CREATE INDEX "audit_logs_entityType_action_createdAt_idx" ON "audit_logs"("entityType", "action", "createdAt");
