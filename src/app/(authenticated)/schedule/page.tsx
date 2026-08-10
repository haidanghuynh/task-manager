"use client";

import { useState, useEffect, useMemo } from "react";
import { useSession } from "next-auth/react";
import { format } from "date-fns";
import Link from "next/link";

export default function SchedulePage() {
  const { data: session } = useSession();
  const user = session?.user as any;

  const now = new Date();
  const [currentMonth, setCurrentMonth] = useState(now.getMonth());
  const [currentYear, setCurrentYear] = useState(now.getFullYear());
  const [tasks, setTasks] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const monthStr = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}`;

  useEffect(() => {
    fetch(`/api/schedule?month=${monthStr}`)
      .then((response) => response.json())
      .then((json) => {
        if (json.success) {
          setTasks(json.data.tasks);
          setEmployees(json.data.employees);
        }
        setLoading(false);
      });
  }, [monthStr]);

  const daysInMonth = useMemo(() => {
    const days = [];
    const lastDay = new Date(currentYear, currentMonth + 1, 0).getDate();
    for (let d = 1; d <= lastDay; d++) {
      days.push(new Date(currentYear, currentMonth, d));
    }
    return days;
  }, [currentMonth, currentYear]);

  const prevMonth = () => {
    if (currentMonth === 0) { setCurrentMonth(11); setCurrentYear(currentYear - 1); }
    else setCurrentMonth(currentMonth - 1);
  };

  const nextMonth = () => {
    if (currentMonth === 11) { setCurrentMonth(0); setCurrentYear(currentYear + 1); }
    else setCurrentMonth(currentMonth + 1);
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
          <button onClick={() => { setCurrentMonth(today.getMonth()); setCurrentYear(today.getFullYear()); }} className="px-3 py-1.5 bg-blue-600 text-white rounded text-sm">Hôm nay</button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-500">Đang tải lịch...</div>
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
                    const taskHere = empTasks.find((t: any) => {
                      const start = new Date(t.plannedStartDate);
                      const end = new Date(t.plannedEndDate);
                      return d >= start && d <= end;
                    });
                    const isStart = taskHere && new Date(taskHere.plannedStartDate).toDateString() === d.toDateString();
                    const isEnd = taskHere && new Date(taskHere.plannedEndDate).toDateString() === d.toDateString();
                    return (
                      <div key={di} className={`border-r relative ${isWeekend(d) ? "bg-gray-50" : ""} ${isToday(d) ? "bg-blue-50" : ""}`}>
                        {isStart && (
                          <Link
                            href={`/tasks/${taskHere.id}`}
                            className="absolute inset-y-0 left-0 rounded-full hover:opacity-80 transition-opacity"
                            style={{
                              backgroundColor: taskHere.product?.color || "#6B7280",
                              width: `${(new Date(taskHere.plannedEndDate).getDate() - new Date(taskHere.plannedStartDate).getDate() + 1) * 100}%`,
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
