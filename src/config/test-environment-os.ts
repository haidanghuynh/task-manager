// Danh sách OS mặc định: dùng làm fallback khi API /api/test-environment-os lỗi
// hoặc database chưa có cấu hình. Danh sách thật do Admin quản lý trên UI Cài đặt.
export interface TestEnvironmentOsGroup {
  label: string;
  options: readonly string[];
}

export const TEST_ENVIRONMENT_OS_GROUPS: readonly TestEnvironmentOsGroup[] = [
  {
    label: "Windows",
    options: [
      "Windows 11",
      "Windows 11 Pro",
      "Windows 10",
      "Windows Server 2025",
      "Windows Server 2022",
      "Windows Server 2019",
    ],
  },
  {
    label: "Linux",
    options: ["Ubuntu 24.04", "Ubuntu 22.04", "AlmaLinux 9", "AlmaLinux 8", "CentOS 7"],
  },
  {
    label: "macOS",
    options: ["macOS 15", "macOS 14"],
  },
];
