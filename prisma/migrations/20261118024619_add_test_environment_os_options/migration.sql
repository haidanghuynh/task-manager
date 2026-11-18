-- CreateTable
CREATE TABLE "test_environment_os_options" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "groupName" TEXT NOT NULL DEFAULT 'Khác',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "test_environment_os_options_name_key" ON "test_environment_os_options"("name");

-- CreateIndex
CREATE INDEX "test_environment_os_options_isActive_sortOrder_idx" ON "test_environment_os_options"("isActive", "sortOrder");

-- Seed danh sách OS mặc định (Admin có thể sửa/xóa trên UI Cài đặt).
INSERT INTO "test_environment_os_options" ("id", "name", "groupName", "sortOrder", "isActive", "createdAt", "updatedAt") VALUES
    ('os_windows_11', 'Windows 11', 'Windows', 10, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('os_windows_11_pro', 'Windows 11 Pro', 'Windows', 20, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('os_windows_10', 'Windows 10', 'Windows', 30, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('os_windows_server_2025', 'Windows Server 2025', 'Windows', 40, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('os_windows_server_2022', 'Windows Server 2022', 'Windows', 50, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('os_windows_server_2019', 'Windows Server 2019', 'Windows', 60, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('os_ubuntu_2404', 'Ubuntu 24.04', 'Linux', 110, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('os_ubuntu_2204', 'Ubuntu 22.04', 'Linux', 120, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('os_almalinux_9', 'AlmaLinux 9', 'Linux', 130, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('os_almalinux_8', 'AlmaLinux 8', 'Linux', 140, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('os_centos_7', 'CentOS 7', 'Linux', 150, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('os_macos_15', 'macOS 15', 'macOS', 210, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('os_macos_14', 'macOS 14', 'macOS', 220, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

