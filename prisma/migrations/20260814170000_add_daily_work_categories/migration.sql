CREATE TABLE "daily_work_categories" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "nameVi" TEXT NOT NULL,
    "nameJa" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#8B5CF6',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE UNIQUE INDEX "daily_work_categories_code_key" ON "daily_work_categories"("code");

INSERT INTO "daily_work_categories" ("id", "code", "nameVi", "nameJa", "color", "updatedAt") VALUES
('daily-meeting', 'MEETING', 'Họp', '会議', '#8B5CF6', CURRENT_TIMESTAMP),
('daily-training', 'TRAINING', 'Đào tạo', '研修', '#8B5CF6', CURRENT_TIMESTAMP),
('daily-support', 'SUPPORT', 'Hỗ trợ', 'サポート', '#8B5CF6', CURRENT_TIMESTAMP),
('daily-documentation', 'DOCUMENTATION', 'Tài liệu', '資料作成', '#8B5CF6', CURRENT_TIMESTAMP),
('daily-report', 'REPORT', 'Báo cáo', '報告', '#8B5CF6', CURRENT_TIMESTAMP);
