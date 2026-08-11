"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useLang } from "@/lib/i18n";

type ScheduleTask = {
  id: string;
  taskCode: string;
  taskName: string;
  currentAssigneeId: string | null;
  plannedStartDate: string;
  plannedEndDate: string;
  status: string;
  product?: { name: string; color: string } | null;
};

type ScheduleEmployee = {
  id: string;
  employeeCode: string;
  fullName: string;
  teamId: string | null;
};

type ScheduleTeam = {
  id: string;
  name: string;
  icon: string;
};

type ScheduleProduct = {
  id: string;
  name: string;
  color: string;
};

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
  const [visibleMonth, setVisibleMonth] = useState(() => new Date(now.getFullYear(), now.getMonth(), 1));
  const [tasks, setTasks] = useState<ScheduleTask[]>([]);
  const [employees, setEmployees] = useState<ScheduleEmployee[]>([]);
  const [teams, setTeams] = useState<ScheduleTeam[]>([]);
  const [products, setProducts] = useState<ScheduleProduct[]>([]);
  const [viewMode, setViewMode] = useState<"employees" | "teams">("employees");
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  const currentMonth = visibleMonth.getMonth();
  const currentYear = visibleMonth.getFullYear();
  const monthStr = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}`;

  useEffect(() => {
    Promise.all([
      fetch("/api/teams").then((response) => response.json()),
      fetch("/api/products").then((response) => response.json()),
    ])
      .then(([teamsJson, productsJson]) => {
        if (teamsJson.success) setTeams(teamsJson.data);
        if (productsJson.success) setProducts(productsJson.data);
      })
      .catch(() => {});
  }, []);

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
    setVisibleMonth((value) => new Date(value.getFullYear(), value.getMonth() - 1, 1));
  };

  const nextMonth = () => {
    setLoading(true);
    setLoadFailed(false);
    setVisibleMonth((value) => new Date(value.getFullYear(), value.getMonth() + 1, 1));
  };

  const goToToday = () => {
    setLoading(true);
    setLoadFailed(false);
    setVisibleMonth(new Date(today.getFullYear(), today.getMonth(), 1));
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
  const groupedTeams = teams
    .map((team) => ({ ...team, employees: employees.filter((employee) => employee.teamId === team.id) }))
    .filter((team) => team.employees.length > 0);
  const employeesWithoutTeam = employees.filter((employee) => !employee.teamId);
  const monthStartKey = `${monthStr}-01`;
  const monthEndKey = `${monthStr}-${String(daysInMonth.length).padStart(2, "0")}`;

  const renderEmployeeRow = (emp: ScheduleEmployee) => {
    const empTasks = tasks.filter((task) => task.currentAssigneeId === emp.id);
    return (
      <div key={emp.id} className="grid border-b hover:bg-gray-50" style={{ gridTemplateColumns: `200px repeat(${daysInMonth.length}, minmax(28px, 1fr))` }}>
        <div className="px-3 py-2 border-r flex items-center">
          <div>
            <p className="text-sm font-medium text-gray-900 truncate">{emp.fullName}</p>
            <p className="text-xs text-gray-400">{emp.employeeCode}</p>
          </div>
        </div>
        {daysInMonth.map((day, dayIndex) => {
          const dayKey = calendarDateKey(day);
          const taskHere = empTasks.find((task) => {
            const startKey = apiDateKey(task.plannedStartDate);
            const endKey = apiDateKey(task.plannedEndDate);
            return dayKey >= startKey && dayKey <= endKey;
          });
          const taskStartKey = taskHere ? apiDateKey(taskHere.plannedStartDate) : "";
          const taskEndKey = taskHere ? apiDateKey(taskHere.plannedEndDate) : "";
          const visibleStartKey = taskStartKey < monthStartKey ? monthStartKey : taskStartKey;
          const visibleEndKey = taskEndKey > monthEndKey ? monthEndKey : taskEndKey;
          const isStart = Boolean(taskHere && dayKey === visibleStartKey);
          return (
            <div key={dayIndex} className={`border-r relative ${isWeekend(day) ? "bg-gray-50" : ""} ${isToday(day) ? "bg-blue-50" : ""}`}>
              {taskHere && isStart && (
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
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-bold text-gray-900">Lịch phân công</h2>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex rounded-lg border p-0.5">
            <button
              type="button"
              onClick={() => setViewMode("employees")}
              className={`rounded-md px-3 py-1 text-sm ${viewMode === "employees" ? "bg-blue-600 text-white" : "text-gray-600 hover:bg-gray-50"}`}
            >
              {lang === "ja" ? "社員別" : "Theo nhân viên"}
            </button>
            <button
              type="button"
              onClick={() => setViewMode("teams")}
              className={`rounded-md px-3 py-1 text-sm ${viewMode === "teams" ? "bg-blue-600 text-white" : "text-gray-600 hover:bg-gray-50"}`}
            >
              {lang === "ja" ? "チーム別" : "Theo nhóm"}
            </button>
          </div>
          <button data-i18n-ignore onClick={prevMonth} className="px-3 py-1.5 border rounded text-sm hover:bg-gray-50">
            {lang === "ja" ? "← 前へ" : "← Trước"}
          </button>
          <span data-i18n-ignore className="text-sm font-semibold min-w-[120px] text-center">
            {lang === "ja" ? `${currentYear}年${currentMonth + 1}月` : `Tháng ${currentMonth + 1}/${currentYear}`}
          </span>
          <button data-i18n-ignore onClick={nextMonth} className="px-3 py-1.5 border rounded text-sm hover:bg-gray-50">
            {lang === "ja" ? "次へ →" : "Tiếp →"}
          </button>
          <button data-i18n-ignore onClick={goToToday} className="px-3 py-1.5 bg-blue-600 text-white rounded text-sm">
            {lang === "ja" ? "今日" : "Hôm nay"}
          </button>
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
              <div className="px-3 py-2 font-medium text-sm text-gray-700 border-r">
                {viewMode === "teams"
                  ? (lang === "ja" ? "チーム／社員" : "Nhóm / Nhân viên")
                  : (lang === "ja" ? "社員" : "Nhân viên")}
              </div>
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

            {viewMode === "employees" ? employees.map(renderEmployeeRow) : (
              <>
                {groupedTeams.map((team) => (
                  <div key={team.id}>
                    <div className="flex items-center gap-2 border-b bg-gray-100 px-3 py-2 text-sm font-semibold text-gray-700">
                      <span>{team.icon}</span>
                      <span>{team.name}</span>
                      <span className="text-xs font-normal text-gray-500">
                        ({team.employees.length} {lang === "ja" ? "名" : "thành viên"})
                      </span>
                    </div>
                    {team.employees.map(renderEmployeeRow)}
                  </div>
                ))}
                {employeesWithoutTeam.length > 0 && (
                  <div>
                    <div className="border-b bg-gray-100 px-3 py-2 text-sm font-semibold text-gray-700">
                      {lang === "ja" ? "チーム未所属" : "Chưa có nhóm"}
                    </div>
                    {employeesWithoutTeam.map(renderEmployeeRow)}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {!loading && products.length > 0 && (
        <div className="flex flex-wrap gap-4 text-xs text-gray-500">
          {products.map((product) => (
            <div key={product.id} className="flex items-center gap-1">
              <div className="h-3 w-3 rounded-full" style={{ backgroundColor: product.color || "#6B7280" }} />
              {product.name}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
