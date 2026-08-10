"use client";

import { useState, useEffect } from "react";
import { useLang } from "@/lib/i18n";

export default function AnnualReportPage() {
  const { lang, tr } = useLang();
  const [report, setReport] = useState<any[]>([]);
  const [year, setYear] = useState(new Date().getFullYear());
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch(`/api/reports/annual?year=${year}`)
      .then((response) => response.json())
      .then((json) => {
        if (json.success) { setReport(json.data.report); setTotal(json.data.total); }
        setLoading(false);
      });
  }, [year]);

  function exportCSV() {
    const headers = ["Nhân viên", "Tổng task được giao", "Tổng task hoàn thành", "Tổng ngày dự kiến", "Tổng ngày thực tế", "Hoàn thành đúng hạn", "Hoàn thành trễ", "Đã hủy", "Zone", "Gate", "Hunter"].map(tr);
    const rows = report.map((r: any) => [
      r.employee?.fullName || "",
      r.totalAssigned,
      r.totalCompleted,
      r.totalPlannedDays,
      r.totalActualDays,
      r.onTime,
      r.late,
      r.cancelled,
      r.zoneTasks,
      r.gateTasks,
      r.hunterTasks,
    ]);

    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${lang === "ja" ? "annual-report" : "bao-cao-nam"}-${year}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900">Báo cáo năm</h2>
        <div className="flex items-center gap-3">
          <select value={year} onChange={(e) => setYear(parseInt(e.target.value))} className="border rounded px-3 py-1.5 text-sm">
            {[2024, 2025, 2026, 2027].map((y) => <option key={y} value={y}>Năm {y}</option>)}
          </select>
          <button onClick={exportCSV} className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700">Xuất CSV</button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-500">Đang tải...</div>
      ) : report.length === 0 ? (
        <div className="text-center py-12 text-gray-400">Không có dữ liệu</div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {report.map((r: any) => (
              <div key={r.employee?.id} className="bg-white p-5 rounded-lg border">
                <p className="font-semibold text-gray-900">{r.employee?.fullName}</p>
                <p className="text-xs text-gray-500 mb-3">{r.employee?.employeeCode} · {r.employee?.department}</p>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div><span className="text-gray-500">Tổng task:</span> <span className="font-medium">{r.totalAssigned}</span></div>
                  <div><span className="text-gray-500">Hoàn thành:</span> <span className="font-medium">{r.totalCompleted}</span></div>
                  <div><span className="text-gray-500">Đúng hạn:</span> <span className="font-medium text-green-600">{r.onTime}</span></div>
                  <div><span className="text-gray-500">Trễ hạn:</span> <span className="font-medium text-red-600">{r.late}</span></div>
                  <div><span className="text-gray-500">Đã hủy:</span> <span className="font-medium">{r.cancelled}</span></div>
                  <div><span className="text-gray-500">Ngày dự kiến:</span> <span className="font-medium">{r.totalPlannedDays}</span></div>
                </div>
                <div className="mt-3 flex gap-2 text-xs">
                  <span className="px-2 py-0.5 rounded bg-green-100 text-green-700">Zone: {r.zoneTasks}</span>
                  <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-700">Gate: {r.gateTasks}</span>
                  <span className="px-2 py-0.5 rounded bg-orange-100 text-orange-700">Hunter: {r.hunterTasks}</span>
                </div>
              </div>
            ))}
          </div>

          <div className="bg-white rounded-lg border overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-4 py-3">Nhân viên</th>
                  <th className="text-left px-4 py-3">Tổng task</th>
                  <th className="text-left px-4 py-3">Hoàn thành</th>
                  <th className="text-left px-4 py-3">Đúng hạn</th>
                  <th className="text-left px-4 py-3">Trễ hạn</th>
                  <th className="text-left px-4 py-3">Ngày dự kiến</th>
                  <th className="text-left px-4 py-3">Ngày thực tế</th>
                  <th className="text-left px-4 py-3">Zone</th>
                  <th className="text-left px-4 py-3">Gate</th>
                  <th className="text-left px-4 py-3">Hunter</th>
                </tr>
              </thead>
              <tbody>
                {report.map((r: any) => (
                  <tr key={r.employee?.id} className="border-b hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium">{r.employee?.fullName}</td>
                    <td className="px-4 py-3">{r.totalAssigned}</td>
                    <td className="px-4 py-3">{r.totalCompleted}</td>
                    <td className="px-4 py-3 text-green-600 font-medium">{r.onTime}</td>
                    <td className="px-4 py-3 text-red-600 font-medium">{r.late}</td>
                    <td className="px-4 py-3">{r.totalPlannedDays}</td>
                    <td className="px-4 py-3">{r.totalActualDays}</td>
                    <td className="px-4 py-3">{r.zoneTasks}</td>
                    <td className="px-4 py-3">{r.gateTasks}</td>
                    <td className="px-4 py-3">{r.hunterTasks}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
