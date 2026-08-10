"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index++) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        value += '"';
        index++;
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      cells.push(value.trim());
      value = "";
    } else {
      value += character;
    }
  }
  cells.push(value.trim());
  return cells;
}

function escapeCsvCell(value: unknown): string {
  const text = String(value ?? "").replace(/\r?\n/g, " ");
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export default function EmployeesPage() {
  const { data: session } = useSession();
  const user = session?.user as any;
  const [employees, setEmployees] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    fetch(`/api/employees?${params}`)
      .then((response) => response.json())
      .then((json) => {
        if (json.success) setEmployees(json.data.employees);
        setLoading(false);
      });
  }, [search]);

  const isManager = user?.role === "ADMIN" || user?.role === "MANAGER";
  const isAdmin = user?.role === "ADMIN";

  async function exportEmployees() {
    const exported: any[] = [];
    let currentPage = 1;
    let totalPages = 1;
    do {
      const response = await fetch(`/api/employees?page=${currentPage}&pageSize=100`);
      const json = await response.json();
      if (!json.success) {
        alert("Không thể export danh sách nhân viên.");
        return;
      }
      exported.push(...json.data.employees);
      totalPages = json.data.pagination.totalPages || 1;
      currentPage++;
    } while (currentPage <= totalPages);

    const header = ["employeeCode", "fullName", "email", "department", "position", "teamName", "isActive"];
    const rows = exported.map((employee) => [
      employee.employeeCode,
      employee.fullName,
      employee.email,
      employee.department,
      employee.position,
      employee.team?.name,
      employee.isActive,
    ]);
    const csv = [header, ...rows].map((row) => row.map(escapeCsvCell).join(",")).join("\r\n");
    const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `employees-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900">Nhân viên</h2>
        {isManager && (
          <div className="flex gap-2">
            <Link href="/employees/new" className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">
              + Thêm nhân viên
            </Link>
            <label className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 cursor-pointer">
              📥 Import CSV
              <input type="file" accept=".csv" className="hidden" onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const text = (await file.text()).replace(/^\uFEFF/, "");
                const lines = text.split(/\r?\n/).filter((line) => line.trim());
                let rows = lines.map(parseCsvLine);
                if (rows[0]?.[0]?.toLowerCase() === "employeecode") rows = rows.slice(1);
                const res = await fetch("/api/employees/bulk", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ rows }),
                });
                const json = await res.json();
                if (json.success) {
                  alert(`✅ ${json.data.imported} nhân viên đã import!\n⏭️ ${json.data.skipped} bị bỏ qua.`);
                  window.location.reload();
                } else {
                  alert("❌ Import thất bại: " + (json.error?.message || "Lỗi"));
                }
              }} />
            </label>
            <button onClick={exportEmployees} className="px-4 py-2 bg-sky-600 text-white rounded-lg text-sm hover:bg-sky-700">
              📤 Export CSV
            </button>
            {isAdmin && <button
              onClick={async () => {
                if (!confirm("Xóa vĩnh viễn tất cả nhân viên và tài khoản liên kết? Thao tác này không thể hoàn tác.")) return;
                if (!confirm("Xác nhận lần cuối: XÓA TẤT CẢ NHÂN VIÊN?")) return;
                const response = await fetch("/api/employees/bulk", { method: "DELETE" });
                if (!response.ok) { alert("Không thể xóa tất cả nhân viên."); return; }
                window.location.reload();
              }}
              className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700"
            >
              Xóa tất cả
            </button>}
          </div>
        )}
      </div>

      <div className="bg-white p-4 rounded-lg border">
        <input
          type="text"
          placeholder="Tìm kiếm theo tên hoặc mã..."
          className="border rounded px-3 py-1.5 text-sm w-full max-w-md"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-500">Đang tải...</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {employees.map((emp) => (
            <div key={emp.id} className="bg-white p-5 rounded-lg border hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between">
                <div>
                  <Link href={`/employees/${emp.id}`} className="font-medium text-gray-900 hover:text-blue-600">{emp.fullName}</Link>
                  <p className="text-xs text-gray-500 font-mono">{emp.employeeCode}</p>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-xs ${emp.isActive ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                  {emp.isActive ? "Đang hoạt động" : "Ngừng hoạt động"}
                </span>
              </div>
              <div className="mt-3 flex gap-2">
                <Link href={`/employees/${emp.id}`} className="text-xs text-blue-600 hover:underline">Xem</Link>
                {isManager && <Link href={`/employees/${emp.id}`} className="text-xs text-orange-600 hover:underline">Sửa</Link>}
                {isAdmin && (
                  <button onClick={async (e) => {
                    e.preventDefault();
                    if (!confirm('Xóa vĩnh viễn nhân viên này và tài khoản đăng nhập liên kết? Thao tác này không thể hoàn tác.')) return;
                    const res = await fetch(`/api/employees/${emp.id}`, { method: 'DELETE' });
                    if (res.ok) window.location.reload();
                    else alert('Không thể xóa nhân viên.');
                  }} className="text-xs text-red-600 hover:underline">Xóa</button>
                )}
              </div>
              <div className="space-y-1 text-sm text-gray-600">
                <p>{emp.department || "—"} · {emp.position || "—"}</p>
                <p className="text-xs text-gray-400">{emp.email || "—"}</p>
                <p className="text-xs mt-1">
                  <span className="font-medium text-blue-600">{emp._count?.tasks || 0}</span> task đang làm
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
