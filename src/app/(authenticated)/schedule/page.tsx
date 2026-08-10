"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useLang } from "@/lib/i18n";

function calendarDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function apiDateKey(value: string) {
  return value.slice(0, 10);
}

function inclusiveDayCount(startKey: string, endKey: string) {
  const start = Date.parse(`${startKey}T00:00:00Z`);
  const end = Date.parse(`${endKey}T00:00:00Z`);
  return Math.floor((end - start) / 86_400_000) + 1;
}

export default function SchedulePage() {
  const { lang } = useLang();

  const now = new Date();
  const [currentMonth, setCurrentMonth] = useState(now.getMonth());
  const [currentYear, setCurrentYear] = useState(now.getFullYear());
  const [tasks, setTasks] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  const monthStr = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}`;

  useEffect(() => {
    let cancelled = false;

    fetch(`/api/schedule?month=${monthStr}`)
      .then(async (response) => {
        const json = await response.json();
        if (!response.ok || !json.success) throw new Error("Unable to load schedule");
        return json;
      })
      .then((json) => {
        if (cancelled) return;
        setTasks(json.data.tasks);
        setEmployees(json.data.employees);
      })
      .catch(() => {
        if (!cancelled) setLoadFailed(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [monthStr, reloadToken]);

  const daysInMonth = useMemo(() => {
    const days = [];
    const lastDay = new Date(currentYear, currentMonth + 1, 0).getDate();
    for (let d = 1; d <= lastDay; d++) {
      days.push(new Date(currentYear, currentMonth, d));
    }
    return days;
  }, [currentMonth, currentYear]);

  const prevMonth = () => {
    setLoading(true);
    setLoadFailed(false);
    if (currentMonth === 0) { setCurrentMonth(11); setCurrentYear(currentYear - 1); }
    else setCurrentMonth(currentMonth - 1);
  };

  const nextMonth = () => {
    setLoading(true);
    setLoadFailed(false);
    if (currentMonth === 11) { setCurrentMonth(0); setCurrentYear(currentYear + 1); }
    else setCurrentMonth(currentMonth + 1);
  };

  const goToToday = () => {
    setLoading(true);
    setLoadFailed(false);
    setCurrentMonth(today.getMonth());
    setCurrentYear(today.getFullYear());
    setReloadToken((value) => value + 1);
  };

  const retry = () => {
    setLoading(true);
    setLoadFailed(false);
    setReloadToken((value) => value + 1);
  };

  const today = new Date();
  const isWeekend = (d: Date) => d.getDay() === 0 || d.getDay() === 6;
  const isToday = (d: Date) => d.toDateString() === today.toDateString();

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900">Lịch phân công</h2>
        <div className="flex items-center gap-3">
          <button onClick={prevMonth} className="px-3 py-1.5 border rounded text-sm hover:bg-gray-50">← Trước</button>
          <span className="text-sm font-semibold min-w-[120px] text-center">
            Tháng {currentMonth + 1}/{currentYear}
          </span>
          <button onClick={nextMonth} className="px-3 py-1.5 border rounded text-sm hover:bg-gray-50">Tiếp →</button>
          <button onClick={goToToday} className="px-3 py-1.5 bg-blue-600 text-white rounded text-sm">Hôm nay</button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-500">Đang tải lịch...</div>
      ) : loadFailed ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center text-red-700">
          <p>{lang === "ja" ? "スケジュールを読み込めません。" : "Không thể tải lịch phân công."}</p>
          <button
            type="button"
            onClick={retry}
            className="mt-3 rounded bg-red-600 px-4 py-2 text-sm text-white hover:bg-red-700"
          >
            {lang === "ja" ? "再試行" : "Thử lại"}
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-lg border overflow-auto">
          <div className="min-w-[800px]">
            <div className="grid sticky top-0 bg-white z-10 border-b" style={{ gridTemplateColumns: `200px repeat(${daysInMonth.length}, minmax(28px, 1fr))` }}>
              <div className="px-3 py-2 font-medium text-sm text-gray-700 border-r">Nhân viên</div>
              {daysInMonth.map((d, i) => (
                <div
                  key={i}
                  className={`text-center py-2 text-xs font-medium border-r ${
                    isToday(d) ? "bg-blue-100 text-blue-700" : isWeekend(d) ? "bg-gray-100 text-gray-500" : "text-gray-600"
                  }`}
                >
                  {d.getDate()}
                  {isToday(d) && <div className="text-[9px] text-blue-500">H.nay</div>}
                </div>
              ))}
            </div>

            {employees.map((emp) => {
              const empTasks = tasks.filter((t) => t.currentAssigneeId === emp.id);
              return (
                <div key={emp.id} className="grid border-b hover:bg-gray-50" style={{ gridTemplateColumns: `200px repeat(${daysInMonth.length}, minmax(28px, 1fr))` }}>
                  <div className="px-3 py-2 border-r flex items-center">
                    <div>
                      <p className="text-sm font-medium text-gray-900 truncate">{emp.fullName}</p>
                      <p className="text-xs text-gray-400">{emp.employeeCode}</p>
                    </div>
                  </div>
                  {daysInMonth.map((d, di) => {
                    const dayKey = calendarDateKey(d);
                    const monthStartKey = `${monthStr}-01`;
                    const monthEndKey = `${monthStr}-${String(daysInMonth.length).padStart(2, "0")}`;
                    const taskHere = empTasks.find((t: any) => {
                      const startKey = apiDateKey(t.plannedStartDate);
                      const endKey = apiDateKey(t.plannedEndDate);
                      return dayKey >= startKey && dayKey <= endKey;
                    });
                    const taskStartKey = taskHere ? apiDateKey(taskHere.plannedStartDate) : "";
                    const taskEndKey = taskHere ? apiDateKey(taskHere.plannedEndDate) : "";
                    const visibleStartKey = taskStartKey < monthStartKey ? monthStartKey : taskStartKey;
                    const visibleEndKey = taskEndKey > monthEndKey ? monthEndKey : taskEndKey;
                    const isStart = Boolean(taskHere && dayKey === visibleStartKey);
                    return (
                      <div key={di} className={`border-r relative ${isWeekend(d) ? "bg-gray-50" : ""} ${isToday(d) ? "bg-blue-50" : ""}`}>
                        {isStart && (
                          <Link
                            href={`/tasks/${taskHere.id}`}
                            className="absolute inset-y-0 left-0 rounded-full hover:opacity-80 transition-opacity"
                            style={{
                              backgroundColor: taskHere.product?.color || "#6B7280",
                              width: `${inclusiveDayCount(visibleStartKey, visibleEndKey) * 100}%`,
                              minWidth: "100%",
                              maxWidth: "none",
                              height: "22px",
                              top: "4px",
                              zIndex: 10,
                            }}
                            title={`${taskHere.taskCode}: ${taskHere.taskName}\n${taskHere.product?.name}\n${taskHere.status}`}
                          >
                            <span className="text-[10px] text-white font-medium px-1 truncate block leading-[22px]">
                              {taskHere.product?.name}
                            </span>
                          </Link>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {!loading && (
        <div className="flex gap-4 text-xs text-gray-500">
          <div className="flex items-center gap-1"><div className="w-3 h-3 rounded-full" style={{ backgroundColor: "#22C55E" }} /> Zone</div>
          <div className="flex items-center gap-1"><div className="w-3 h-3 rounded-full" style={{ backgroundColor: "#3B82F6" }} /> Gate</div>
          <div className="flex items-center gap-1"><div className="w-3 h-3 rounded-full" style={{ backgroundColor: "#F97316" }} /> Hunter</div>
        </div>
      )}
    </div>
  );
}
