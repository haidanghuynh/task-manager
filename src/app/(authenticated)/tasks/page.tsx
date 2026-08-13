"use client";

import { Suspense, useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { STATUS_LABELS, PRIORITY_LABELS, STATUS_COLORS, PRIORITY_COLORS } from "@/types";
import { formatDate } from "@/lib/date";
import type { TaskStatus, TaskPriority } from "@/types";
import { useLang } from "@/lib/i18n";
import { hasPermission, type AppPermission } from "@/lib/permissions";

type ViewMode = "list" | "assignee" | "team";

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index++) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') { value += '"'; index++; }
      else quoted = !quoted;
    } else if (character === "," && !quoted) { cells.push(value.trim()); value = ""; }
    else value += character;
  }
  cells.push(value.trim());
  return cells;
}

function escapeCsvCell(value: unknown): string {
  const text = String(value ?? "").replace(/\r?\n/g, " ");
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function csvDate(value: unknown): string {
  if (!value) return "";
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

export default function TasksPage() {
  return (
    <Suspense fallback={<div className="p-6 text-center text-gray-500">Đang tải...</div>}>
      <TasksPageContent />
    </Suspense>
  );
}

function TasksPageContent() {
  const { data: session } = useSession();
  const { lang } = useLang();
  const searchParams = useSearchParams();
  const user = session?.user as { role: "ADMIN" | "MANAGER" | "EMPLOYEE"; permissions?: AppPermission[] } | undefined;

  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [teams, setTeams] = useState<any[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    const requestedView = searchParams.get("view");
    return requestedView === "list" || requestedView === "assignee" || requestedView === "team" ? requestedView : "team";
  });
  const [groupedType, setGroupedType] = useState<string | false>(false);
  const [filters, setFilters] = useState(() => ({
    search: "", status: "", product: "", priority: "",
    employee: searchParams.get("employee") || "",
    teamId: searchParams.get("teamId") || "",
    startDate: searchParams.get("startDate") || "",
    endDate: searchParams.get("endDate") || "",
    overdue: searchParams.get("overdue") === "true",
  }));

  const canCreate = hasPermission(user, "TASK_CREATE");
  const canEdit = hasPermission(user, "TASK_EDIT");
  const canDelete = hasPermission(user, "TASK_DELETE");
  const canImportExport = hasPermission(user, "TASK_IMPORT_EXPORT");
  const isAdmin = user?.role === "ADMIN";

  useEffect(() => { fetchTasks(); }, [page, filters, viewMode]);
  useEffect(() => { fetch("/api/teams").then(r => r.json()).then(j => j.success && setTeams(j.data)); }, []);

  async function fetchTasks() {
    setLoading(true);
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("pageSize", "20");
    params.set("assignment", "assigned");
    if (filters.search) params.set("search", filters.search);
    if (filters.status) params.set("status", filters.status);
    if (filters.product) params.set("product", filters.product);
    if (filters.employee) params.set("employee", filters.employee);
    if (filters.priority) params.set("priority", filters.priority);
    if (filters.startDate) params.set("startDate", filters.startDate);
    if (filters.endDate) params.set("endDate", filters.endDate);
    if (filters.teamId) params.set("teamId", filters.teamId);
    if (filters.overdue) params.set("overdue", "true");

    if (viewMode === "assignee") params.set("groupBy", "assignee");
    if (viewMode === "team") params.set("groupBy", "team");

    const res = await fetch(`/api/tasks?${params}`);
    const json = await res.json();
    if (json.success) {
      setTasks(json.data.tasks);
      setTotal(json.data.pagination.total);
      setGroupedType(json.data.grouped || false);
    }
    setLoading(false);
  }

  async function handleDelete(id: string) {
    if (!confirm("Bạn có chắc muốn xóa task này?")) return;
    await fetch(`/api/tasks/${id}`, { method: "DELETE" });
    fetchTasks();
  }

  function appendFilters(params: URLSearchParams) {
    params.set("assignment", "assigned");
    if (filters.search) params.set("search", filters.search);
    if (filters.status) params.set("status", filters.status);
    if (filters.product) params.set("product", filters.product);
    if (filters.employee) params.set("employee", filters.employee);
    if (filters.priority) params.set("priority", filters.priority);
    if (filters.startDate) params.set("startDate", filters.startDate);
    if (filters.endDate) params.set("endDate", filters.endDate);
    if (filters.teamId) params.set("teamId", filters.teamId);
    if (filters.overdue) params.set("overdue", "true");
  }

  async function exportTasks() {
    const exported: any[] = [];
    let currentPage = 1;
    let totalPages = 1;
    do {
      const params = new URLSearchParams({ page: String(currentPage), pageSize: "100" });
      appendFilters(params);
      const response = await fetch(`/api/tasks?${params}`);
      const json = await response.json();
      if (!json.success) {
        alert(lang === "ja" ? "タスク一覧をエクスポートできません。" : "Không thể export danh sách task.");
        return;
      }
      exported.push(...json.data.tasks);
      totalPages = json.data.pagination.totalPages || 1;
      currentPage++;
    } while (currentPage <= totalPages);

    const header = ["taskCode", "taskName", "description", "productCode", "assigneeCode", "plannedStartDate", "plannedEndDate", "actualStartDate", "actualEndDate", "status", "progress", "priority", "note"];
    const rows = exported.map((task) => [
      task.taskCode, task.taskName, task.description, task.product?.code,
      task.currentAssignee?.employeeCode, csvDate(task.plannedStartDate), csvDate(task.plannedEndDate),
      csvDate(task.actualStartDate), csvDate(task.actualEndDate), task.status, task.progress, task.priority, task.note,
    ]);
    const csv = [header, ...rows].map((row) => row.map(escapeCsvCell).join(",")).join("\r\n");
    const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `tasks-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function importTasks(file: File) {
    const csv = (await file.text()).replace(/^\uFEFF/, "");
    const lines = csv.split(/\r?\n/).filter((line) => line.trim());
    let rows = lines.map(parseCsvLine);
    if (rows[0]?.[0]?.toLowerCase() === "taskcode") rows = rows.slice(1);
    const response = await fetch("/api/tasks/bulk", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rows }),
    });
    const json = await response.json();
    if (!json.success) {
      alert(lang === "ja" ? "CSVのインポートに失敗しました。" : "Import CSV thất bại.");
      return;
    }
    const localizeReason = (reason: string) => {
      const entries: Array<[string, string, string]> = [
        ["Invalid task name", "Tên task không hợp lệ", "タスク名が無効です"],
        ["Product code not found", "Không tìm thấy mã sản phẩm", "製品コードが見つかりません"],
        ["Employee code is duplicated", "Mã nhân viên bị trùng", "社員コードが重複しています"],
        ["Employee code not found", "Không tìm thấy mã nhân viên", "社員コードが見つかりません"],
        ["Invalid planned date range", "Khoảng ngày dự kiến không hợp lệ", "予定日の範囲が無効です"],
        ["Invalid actual date", "Ngày thực tế không hợp lệ", "実績日が無効です"],
        ["Invalid status", "Trạng thái không hợp lệ", "ステータスが無効です"],
        ["Invalid priority", "Độ ưu tiên không hợp lệ", "優先度が無効です"],
        ["Progress must be", "Tiến độ phải là số nguyên từ 0 đến 100", "進捗は0～100の整数で入力してください"],
        ["Invalid task code", "Mã task không hợp lệ", "タスクコードが無効です"],
        ["Task code is required", "Mã task là bắt buộc", "タスクコードは必須です"],
        ["Task code already exists", "Mã task đã tồn tại", "タスクコードは既に存在します"],
        ["Database error", "Lỗi database", "データベースエラー"],
      ];
      const match = entries.find(([prefix]) => reason.startsWith(prefix));
      return match ? (lang === "ja" ? match[2] : match[1]) : reason;
    };
    const details = (json.data.errors || []).slice(0, 5).map((item: { row: number; reason: string }) => `#${item.row}: ${localizeReason(item.reason)}`).join("\n");
    alert(lang === "ja"
      ? `${json.data.imported}件をインポート、${json.data.skipped}件をスキップしました。${details ? `\n${details}` : ""}`
      : `Đã import ${json.data.imported} task, bỏ qua ${json.data.skipped} dòng.${details ? `\n${details}` : ""}`);
    setPage(1);
    await fetchTasks();
  }

  const resetFilters = () => setFilters({ search: "", status: "", product: "", priority: "", employee: "", teamId: "", startDate: "", endDate: "", overdue: false });

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-2xl font-bold text-gray-900">Danh sách task</h2>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
            <button onClick={() => setViewMode("list")} className={`px-3 py-1 rounded text-xs ${viewMode === "list" ? "bg-white shadow font-medium" : "text-gray-500"}`}>📋 List</button>
            <button onClick={() => setViewMode("assignee")} className={`px-3 py-1 rounded text-xs ${viewMode === "assignee" ? "bg-white shadow font-medium" : "text-gray-500"}`}>👤 Theo người</button>
            <button onClick={() => setViewMode("team")} className={`px-3 py-1 rounded text-xs ${viewMode === "team" ? "bg-white shadow font-medium" : "text-gray-500"}`}>🏢 Theo nhóm</button>
          </div>
          {(canCreate || canImportExport || isAdmin) && (
            <div className="flex flex-wrap gap-2">
              {canCreate && <Link href="/tasks/new" className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">+ Tạo task mới</Link>}
              {canImportExport && <label className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 cursor-pointer">
                📥 {lang === "ja" ? "CSVインポート" : "Import CSV"}
                <input type="file" accept=".csv,text/csv" className="hidden" onChange={async (event) => {
                  const file = event.target.files?.[0];
                  if (file) await importTasks(file);
                  event.target.value = "";
                }} />
              </label>}
              {canImportExport && <button onClick={exportTasks} className="px-4 py-2 bg-sky-600 text-white rounded-lg text-sm hover:bg-sky-700">
                📤 {lang === "ja" ? "CSVエクスポート" : "Export CSV"}
              </button>}
              {isAdmin && <button
                onClick={async () => {
                  if (!confirm("⚠️ XÓA TẤT CẢ TASKS? Các task sẽ bị chuyển vào thùng rác (soft delete). KHÔNG thể hoàn tác!")) return;
                  if (!confirm("Xác nhận lần cuối: Xóa toàn bộ tasks?")) return;
                  await fetch("/api/tasks/bulk", { method: "DELETE" });
                  window.location.reload();
                }}
                className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700"
              >
                🗑 Xóa tất cả
              </button>}
            </div>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 bg-white p-4 rounded-lg border">
        <input type="text" placeholder="Tìm mã hoặc tên task..." className="border rounded px-3 py-1.5 text-sm flex-1 min-w-[180px]" value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.target.value })} />
        <select className="border rounded px-2 py-1.5 text-sm" value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
          <option value="">Tất cả trạng thái</option>
          <option value="PLANNED">Chưa bắt đầu</option>
          <option value="IN_PROGRESS">Đang thực hiện</option>
          <option value="WAITING">Đang chờ</option>
          <option value="COMPLETED">Hoàn thành</option>
          <option value="CANCELLED">Đã hủy</option>
        </select>
        <select className="border rounded px-2 py-1.5 text-sm" value={filters.priority} onChange={(e) => setFilters({ ...filters, priority: e.target.value })}>
          <option value="">Ưu tiên</option>
          <option value="LOW">Thấp</option>
          <option value="MEDIUM">Trung bình</option>
          <option value="HIGH">Cao</option>
          <option value="URGENT">Khẩn cấp</option>
        </select>
        <select className="border rounded px-2 py-1.5 text-sm" value={filters.teamId} onChange={(e) => setFilters({ ...filters, teamId: e.target.value })}>
          <option value="">Tất cả nhóm</option>
          {teams.map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <input type="date" className="border rounded px-2 py-1.5 text-sm" value={filters.startDate} onChange={(e) => setFilters({ ...filters, startDate: e.target.value })} title="Từ ngày" />
        <span className="text-gray-400 self-center">-</span>
        <input type="date" className="border rounded px-2 py-1.5 text-sm" value={filters.endDate} onChange={(e) => setFilters({ ...filters, endDate: e.target.value })} title="Đến ngày" />
        <label className="flex items-center gap-1 text-sm cursor-pointer">
          <input type="checkbox" checked={filters.overdue} onChange={(e) => setFilters({ ...filters, overdue: e.target.checked })} />
          Quá hạn
        </label>
        <button onClick={resetFilters} className="px-2 py-1.5 text-xs text-gray-500 hover:text-gray-700 border rounded">✕ Reset</button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-500">Đang tải...</div>
      ) : tasks.length === 0 ? (
        <div className="text-center py-12 text-gray-400">Không có task nào</div>
      ) : groupedType === "team" ? (
        /* TEAM VIEW */
        <div className="space-y-6">
          {tasks.map((team: any) => (
            <div key={team.team.id} className="bg-white rounded-lg border">
              <div className="task-team-header flex items-center gap-3 px-4 py-3 bg-gradient-to-r from-blue-50 to-indigo-50 border-b rounded-t-lg">
                <div className="w-9 h-9 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold text-sm">🏢</div>
                <div className="flex-1">
                  <p className="font-bold text-gray-900 text-lg">{team.team.name}</p>
                  <p className="text-xs text-gray-500">{team.totalTasks} tasks · {team.assignees.length} người phụ trách</p>
                </div>
              </div>

              <div className="divide-y">
                {team.assignees.map((assignee: any) => (
                  <div key={assignee.employee?.id || "unassigned"} className="px-4 py-3 hover:bg-gray-50">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-xs">
                        {assignee.employee?.fullName?.charAt(0) || "?"}
                      </div>
                      <div className="flex-1">
                        <p className="font-semibold text-sm text-gray-900">{assignee.employee?.fullName || "Chưa phân công"}</p>
                        <p className="text-xs text-gray-400">{assignee.employee?.employeeCode}</p>
                      </div>
                      <div className="flex gap-1.5 text-[11px]">
                        <span className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 font-medium">{assignee.count} tasks</span>
                        <span className="px-1.5 py-0.5 rounded bg-yellow-50 text-yellow-700">{assignee.inProgress} đang làm</span>
                        <span data-i18n-ignore className="px-1.5 py-0.5 rounded bg-green-50 text-green-700">
                          {lang === "ja" ? `完了 ${assignee.completed}件` : `${assignee.completed} xong`}
                        </span>
                      </div>
                    </div>
                    <div className="ml-10 space-y-1">
                      {assignee.tasks.map((task: any) => (
                        <div key={task.id} className="flex items-center gap-2 py-1">
                          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: task.product?.color }} />
                          <Link href={`/tasks/${task.id}`} className="text-sm text-blue-600 hover:underline flex-1 truncate">{task.taskCode}: {task.taskName}</Link>
                          <span className={`px-1.5 py-0.5 rounded-full text-[11px] ${STATUS_COLORS[task.status as TaskStatus]}`}>{STATUS_LABELS[task.status as TaskStatus]}</span>
                          <span className="text-[11px] text-gray-400">{formatDate(task.plannedStartDate)} → {formatDate(task.plannedEndDate)}</span>
                          <Link href={`/tasks/${task.id}`} className="text-[11px] text-blue-600 hover:underline">Xem</Link>
                          {canEdit && <Link href={`/tasks/${task.id}`} className="text-[11px] text-orange-600 hover:underline">Sửa</Link>}
                          {canDelete && <button onClick={() => handleDelete(task.id)} className="text-[11px] text-red-600 hover:underline">Xóa</button>}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : groupedType === "assignee" ? (
        /* ASSIGNEE VIEW */
        <div className="space-y-4">
          {tasks.map((assignee: any) => (
            <div key={assignee.employee?.id || "unassigned"} className="bg-white rounded-lg border">
              <div className="flex items-center gap-3 px-4 py-3 bg-gray-50 border-b rounded-t-lg">
                <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-sm">
                  {assignee.employee?.fullName?.charAt(0) || "?"}
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-gray-900">{assignee.employee?.fullName || "Chưa phân công"}</p>
                  <p className="text-xs text-gray-500">{assignee.employee?.employeeCode}</p>
                </div>
                <div className="flex gap-2 text-xs">
                  <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 font-medium">{assignee.count} tasks</span>
                  <span className="px-2 py-0.5 rounded bg-yellow-50 text-yellow-700">{assignee.inProgress} đang làm</span>
                  <span className="px-2 py-0.5 rounded bg-gray-100 text-gray-600">{assignee.planned} plan</span>
                  <span data-i18n-ignore className="px-2 py-0.5 rounded bg-green-50 text-green-700">
                    {lang === "ja" ? `完了 ${assignee.completed}件` : `${assignee.completed} xong`}
                  </span>
                </div>
              </div>
              <div className="divide-y">
                {assignee.tasks.map((task: any) => (
                  <div key={task.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50">
                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: task.product?.color }} />
                    <Link href={`/tasks/${task.id}`} className="text-sm text-blue-600 hover:underline flex-1 truncate">{task.taskCode}: {task.taskName}</Link>
                    <span className={`px-2 py-0.5 rounded-full text-xs ${STATUS_COLORS[task.status as TaskStatus]}`}>{STATUS_LABELS[task.status as TaskStatus]}</span>
                    <span className="text-xs text-gray-400">{formatDate(task.plannedStartDate)} → {formatDate(task.plannedEndDate)}</span>
                    <Link href={`/tasks/${task.id}`} className="text-xs text-blue-600 hover:underline">Xem</Link>
                    {canEdit && <Link href={`/tasks/${task.id}`} className="text-xs text-orange-600 hover:underline">Sửa</Link>}
                    {canDelete && <button onClick={() => handleDelete(task.id)} className="text-xs text-red-600 hover:underline">Xóa</button>}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* LIST VIEW - flat list sorted by assignee name */
        <>
          <div className="bg-white rounded-lg border overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-700">Người phụ trách</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-700">Mã task</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-700">Tên task</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-700">Sản phẩm</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-700">Bắt đầu</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-700">Kết thúc</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-700">Trạng thái</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-700">Tiến độ</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-700">Ưu tiên</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-700">TT</th>
                </tr>
              </thead>
              <tbody>
                {tasks.map((task: any) => (
                  <tr key={task.id} className="border-b hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-sm">{task.currentAssignee?.fullName || (lang === "ja" ? "未割り当て" : "Chờ phân công")}</td>
                    <td className="px-4 py-3 font-mono text-xs">{task.taskCode}</td>
                    <td className="px-4 py-3">
                      <Link href={`/tasks/${task.id}`} className="text-blue-600 hover:underline">{task.taskName}</Link>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1">
                        <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: task.product?.color }} />
                        {task.product?.name}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs">{formatDate(task.plannedStartDate)}</td>
                    <td className="px-4 py-3 text-xs">{formatDate(task.plannedEndDate)}</td>
                    <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded-full text-xs ${STATUS_COLORS[task.status as TaskStatus]}`}>{STATUS_LABELS[task.status as TaskStatus]}</span></td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1"><div className="w-12 h-1.5 bg-gray-200 rounded-full"><div className="h-full bg-blue-500 rounded-full" style={{ width: `${task.progress}%` }} /></div><span className="text-xs">{task.progress}%</span></div>
                    </td>
                    <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded-full text-xs ${PRIORITY_COLORS[task.priority as TaskPriority]}`}>{PRIORITY_LABELS[task.priority as TaskPriority]}</span></td>
                    <td className="px-4 py-3 space-x-1">
                      <Link href={`/tasks/${task.id}`} className="text-blue-600 text-xs hover:underline">Xem</Link>
                      {canDelete && <button onClick={() => handleDelete(task.id)} className="text-red-600 text-xs hover:underline">Xóa</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500">Tổng: {total} task</span>
            <div className="flex gap-2">
              <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="px-3 py-1 border rounded text-sm disabled:opacity-30">Trước</button>
              <span className="px-3 py-1 text-sm">{page}</span>
              <button disabled={page * 20 >= total} onClick={() => setPage(page + 1)} className="px-3 py-1 border rounded text-sm disabled:opacity-30">Tiếp</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
