export type UserRole = "ADMIN" | "MANAGER" | "EMPLOYEE";
export type TaskStatus = "PLANNED" | "IN_PROGRESS" | "WAITING" | "COMPLETED" | "CANCELLED";
export type TaskPriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";

export const STATUS_LABELS: Record<TaskStatus, string> = {
  PLANNED: "Chưa bắt đầu",
  IN_PROGRESS: "Đang thực hiện",
  WAITING: "Đang chờ",
  COMPLETED: "Hoàn thành",
  CANCELLED: "Đã hủy",
};

export const PRIORITY_LABELS: Record<TaskPriority, string> = {
  LOW: "Thấp",
  MEDIUM: "Trung bình",
  HIGH: "Cao",
  URGENT: "Khẩn cấp",
};

export const PRIORITY_COLORS: Record<TaskPriority, string> = {
  LOW: "bg-gray-100 text-gray-700",
  MEDIUM: "bg-blue-100 text-blue-700",
  HIGH: "bg-orange-100 text-orange-700",
  URGENT: "bg-red-100 text-red-700",
};

export const STATUS_COLORS: Record<TaskStatus, string> = {
  PLANNED: "bg-gray-100 text-gray-700",
  IN_PROGRESS: "bg-yellow-100 text-yellow-700",
  WAITING: "bg-purple-100 text-purple-700",
  COMPLETED: "bg-green-100 text-green-700",
  CANCELLED: "bg-red-100 text-red-700",
};