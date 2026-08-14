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

const DAILY_WORK_LABELS: Record<DailyWorkCategory, { vi: string; ja: string }> = {
  MEETING: { vi: "Họp", ja: "会議" },
  TRAINING: { vi: "Đào tạo", ja: "研修" },
  SUPPORT: { vi: "Hỗ trợ", ja: "サポート" },
  DOCUMENTATION: { vi: "Tài liệu", ja: "資料作成" },
  REPORT: { vi: "Báo cáo", ja: "報告" },
  OTHER: { vi: "Khác", ja: "その他" },
};

export function dailyWorkLabel(category: string | null | undefined, lang: "vi" | "ja" = "vi") {
  if (!category || !(category in DAILY_WORK_LABELS)) {
    return lang === "ja" ? "日常業務" : "Công việc hằng ngày";
  }
  return DAILY_WORK_LABELS[category as DailyWorkCategory][lang];
}
