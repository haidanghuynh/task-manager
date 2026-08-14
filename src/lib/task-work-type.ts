export const DAILY_WORK_COLOR = "#8B5CF6";

export const DAILY_WORK_CATEGORIES = [
  "MEETING",
  "TRAINING",
  "SUPPORT",
  "DOCUMENTATION",
  "REPORT",
  "OTHER",
] as const;

export type DailyWorkCategory = (typeof DAILY_WORK_CATEGORIES)[number];

export type DailyWorkCategoryOption = { id?: string; code: string; nameVi: string; nameJa: string; color: string; isActive?: boolean };

export const DEFAULT_DAILY_WORK_OPTIONS: DailyWorkCategoryOption[] = [
  { code: "MEETING", nameVi: "Họp", nameJa: "会議", color: DAILY_WORK_COLOR },
  { code: "TRAINING", nameVi: "Đào tạo", nameJa: "研修", color: DAILY_WORK_COLOR },
  { code: "SUPPORT", nameVi: "Hỗ trợ", nameJa: "サポート", color: DAILY_WORK_COLOR },
  { code: "DOCUMENTATION", nameVi: "Tài liệu", nameJa: "資料作成", color: DAILY_WORK_COLOR },
  { code: "REPORT", nameVi: "Báo cáo", nameJa: "報告", color: DAILY_WORK_COLOR },
];

export function dailyWorkLabel(category: string | null | undefined, lang: "vi" | "ja" = "vi", options: DailyWorkCategoryOption[] = DEFAULT_DAILY_WORK_OPTIONS) {
  if (!category) return lang === "ja" ? "日常業務" : "Công việc hằng ngày";
  if (category === "OTHER") return lang === "ja" ? "その他" : "Khác";
  const option = options.find((item) => item.code === category);
  return option ? (lang === "ja" ? option.nameJa : option.nameVi) : category;
}

export function dailyWorkColor(category: string | null | undefined, options: DailyWorkCategoryOption[] = DEFAULT_DAILY_WORK_OPTIONS) {
  return options.find((item) => item.code === category)?.color || DAILY_WORK_COLOR;
}
