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

type PositionedTask = ScheduleTask & {
  visibleStartKey: string;
  visibleEndKey: string;
  lane: number;
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

function positionTasks(tasks: ScheduleTask[], monthStartKey: string, monthEndKey: string): PositionedTask[] {
  const laneEndKeys: string[] = [];
  return tasks
    .map((task) => {
      const startKey = apiDateKey(task.plannedStartDate);
      const endKey = apiDateKey(task.plannedEndDate);
      return {
        ...task,
        visibleStartKey: startKey < monthStartKey ? monthStartKey : startKey,
        visibleEndKey: endKey > monthEndKey ? monthEndKey : endKey,
      };
    })
    .sort((a, b) => a.visibleStartKey.localeCompare(b.visibleStartKey) || a.visibleEndKey.localeCompare(b.visibleEndKey))
    .map((task) => {
      let lane = laneEndKeys.findIndex((endKey) => endKey < task.visibleStartKey);
      if (lane === -1) lane = laneEndKeys.length;
      laneEndKeys[lane] = task.visibleEndKey;
      return { ...task, lane };
    });
}

export default function SchedulePage() {
  const { lang } = useLang();

  const now = new Date();
  const [visibleMonth, setVisibleMonth] = useState(() => new Date(now.getFullYear(), now.getMonth(), 1));
  const [tasks, setTasks] = useState<ScheduleTask[]>([]);
  const [employees, setEmployees] = useState<ScheduleEmployee[]>([]);
  const [teams, setTeams] = useState<ScheduleTeam[]>([]);
  const [products, setProducts] = useState<ScheduleProduct[]>([]);
  const [viewMode, setViewMode] = useState<"employees" | "teams">("teams");
  const [showCompleted, setShowCompleted] = useState(false);
  const [collapsedTeams, setCollapsedTeams] = useState<Set<string>>(() => new Set());
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

    const query = new URLSearchParams({ month: monthStr });
    if (showCompleted) query.set("includeCompleted", "true");

    fetch(`/api/schedule?${query}`)
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
  }, [monthStr, reloadToken, showCompleted]);

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
  const weekdayLabels = lang === "ja" ? ["日", "月", "火", "水", "木", "金", "土"] : ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
  const groupedTeams = teams
    .map((team) => ({ ...team, employees: employees.filter((employee) => employee.teamId === team.id) }))
    .filter((team) => team.employees.length > 0);
  const employeesWithoutTeam = employees.filter((employee) => !employee.teamId);
  const employeesWithoutTeamIds = new Set(employeesWithoutTeam.map((employee) => employee.id));
  const unassignedTaskCount = tasks.filter(
    (task) => task.currentAssigneeId && employeesWithoutTeamIds.has(task.currentAssigneeId),
  ).length;
  const monthStartKey = `${monthStr}-01`;
  const monthEndKey = `${monthStr}-${String(daysInMonth.length).padStart(2, "0")}`;
  const unassignedTeamKey = "__unassigned__";

  const toggleTeam = (teamId: string) => {
    setCollapsedTeams((current) => {
      const next = new Set(current);
      if (next.has(teamId)) next.delete(teamId);
      else next.add(teamId);
      return next;
    });
  };

  const collapseAllTeams = () => {
    const teamIds = groupedTeams.map((team) => team.id);
    if (employeesWithoutTeam.length > 0) teamIds.push(unassignedTeamKey);
    setCollapsedTeams(new Set(teamIds));
  };

  const expandAllTeams = () => setCollapsedTeams(new Set());

  const renderEmployeeRow = (emp: ScheduleEmployee) => {
    const empTasks = tasks.filter((task) => task.currentAssigneeId === emp.id);
    const positionedTasks = positionTasks(empTasks, monthStartKey, monthEndKey);
    const laneCount = Math.max(1, ...positionedTasks.map((task) => task.lane + 1));
    const rowHeight = laneCount * 26 + 8;
    return (
      <div key={emp.id} className="grid border-b hover:bg-gray-50" style={{ gridTemplateColumns: `200px repeat(${daysInMonth.length}, minmax(28px, 1fr))` }}>
        <div className="px-3 py-2 border-r flex items-center" style={{ minHeight: `${rowHeight}px` }}>
          <div>
            <p className="text-sm font-medium text-gray-900 truncate">{emp.fullName}</p>
            <p className="text-xs text-gray-400">{emp.employeeCode}</p>
          </div>
        </div>
        {daysInMonth.map((day, dayIndex) => {
          const dayKey = calendarDateKey(day);
          const startingTasks = positionedTasks.filter((task) => task.visibleStartKey === dayKey);
          return (
            <div key={dayIndex} style={{ minHeight: `${rowHeight}px` }} className={`border-r relative ${isWeekend(day) ? "bg-gray-50" : ""} ${isToday(day) ? "bg-blue-50" : ""}`}>
              {startingTasks.map((task) => (
                <Link
                  key={task.id}
                  href={`/tasks/${task.id}`}
                  className="absolute left-0 rounded-full hover:opacity-80 transition-opacity"
                  style={{
                    backgroundColor: task.product?.color || "#6B7280",
                    width: `${inclusiveDayCount(task.visibleStartKey, task.visibleEndKey) * 100}%`,
                    minWidth: "100%",
                    maxWidth: "none",
                    height: "22px",
                    top: `${4 + task.lane * 26}px`,
                    zIndex: 10 + task.lane,
                  }}
                  title={`${task.taskCode}: ${task.taskName}\n${task.product?.name}\n${task.status}`}
                >
                  <span className="text-[10px] text-white font-medium px-1 truncate block leading-[22px]">
                    {task.product?.name}
                  </span>
                </Link>
              ))}
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
          {viewMode === "teams" && (
            <div data-i18n-ignore className="flex rounded-lg border p-0.5 text-xs">
              <button type="button" onClick={expandAllTeams} className="rounded-md px-2 py-1 text-gray-600 hover:bg-gray-50">
                {lang === "ja" ? "すべて展開" : "Mở rộng tất cả"}
              </button>
              <button type="button" onClick={collapseAllTeams} className="rounded-md px-2 py-1 text-gray-600 hover:bg-gray-50">
                {lang === "ja" ? "すべて折りたたむ" : "Thu gọn tất cả"}
              </button>
            </div>
          )}
          <label data-i18n-ignore className="flex cursor-pointer items-center gap-2 text-sm text-gray-600">
            <input
              type="checkbox"
              checked={showCompleted}
              onChange={(event) => {
                setLoading(true);
                setLoadFailed(false);
                setShowCompleted(event.target.checked);
              }}
            />
            <span>{lang === "ja" ? "完了・キャンセル済みを表示" : "Hiển thị task hoàn thành/đã hủy"}</span>
          </label>
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
                  <div>{d.getDate()}</div>
                  <div data-i18n-ignore className="text-[9px] font-normal">{weekdayLabels[d.getDay()]}</div>
                  {isToday(d) && <div data-i18n-ignore className="text-[9px] text-blue-500">{lang === "ja" ? "今日" : "H.nay"}</div>}
                </div>
              ))}
            </div>

            {viewMode === "employees" ? employees.map(renderEmployeeRow) : (
              <>
                {groupedTeams.map((team) => {
                  const employeeIds = new Set(team.employees.map((employee) => employee.id));
                  const taskCount = tasks.filter((task) => task.currentAssigneeId && employeeIds.has(task.currentAssigneeId)).length;
                  const collapsed = collapsedTeams.has(team.id);
                  return (
                    <div key={team.id}>
                      <button
                        type="button"
                        onClick={() => toggleTeam(team.id)}
                        aria-expanded={!collapsed}
                        className="flex w-full items-center gap-2 border-b bg-gray-100 px-3 py-2 text-left text-sm font-semibold text-gray-700 hover:bg-gray-50"
                      >
                        <span aria-hidden="true" className="w-3 text-xs">{collapsed ? "▸" : "▾"}</span>
                        <span>{team.icon}</span>
                        <span>{team.name}</span>
                        <span data-i18n-ignore className="text-xs font-normal text-gray-500">
                          ({team.employees.length} {lang === "ja" ? "名" : "thành viên"})
                        </span>
                        <span data-i18n-ignore className="ml-auto text-xs font-normal text-gray-500">
                          {lang === "ja" ? `${taskCount} タスク` : `${taskCount} task`}
                        </span>
                      </button>
                      {!collapsed && team.employees.map(renderEmployeeRow)}
                    </div>
                  );
                })}
                {employeesWithoutTeam.length > 0 && (
                  <div>
                    <button
                      type="button"
                      onClick={() => toggleTeam(unassignedTeamKey)}
                      aria-expanded={!collapsedTeams.has(unassignedTeamKey)}
                      className="flex w-full items-center gap-2 border-b bg-gray-100 px-3 py-2 text-left text-sm font-semibold text-gray-700 hover:bg-gray-50"
                    >
                      <span aria-hidden="true" className="w-3 text-xs">{collapsedTeams.has(unassignedTeamKey) ? "▸" : "▾"}</span>
                      <span>{lang === "ja" ? "チーム未所属" : "Chưa có nhóm"}</span>
                      <span data-i18n-ignore className="text-xs font-normal text-gray-500">
                        ({employeesWithoutTeam.length} {lang === "ja" ? "名" : "thành viên"})
                      </span>
                      <span data-i18n-ignore className="ml-auto text-xs font-normal text-gray-500">
                        {lang === "ja" ? `${unassignedTaskCount} タスク` : `${unassignedTaskCount} task`}
                      </span>
                    </button>
                    {!collapsedTeams.has(unassignedTeamKey) && employeesWithoutTeam.map(renderEmployeeRow)}
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
