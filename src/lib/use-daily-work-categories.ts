"use client";

import { useEffect, useState } from "react";
import { DEFAULT_DAILY_WORK_OPTIONS, type DailyWorkCategoryOption } from "@/lib/task-work-type";

export function useDailyWorkCategories() {
  const [categories, setCategories] = useState<DailyWorkCategoryOption[]>(DEFAULT_DAILY_WORK_OPTIONS);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/daily-work-categories")
      .then((response) => response.json())
      .then((json) => { if (!cancelled && json.success && Array.isArray(json.data)) setCategories(json.data); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  return categories;
}
