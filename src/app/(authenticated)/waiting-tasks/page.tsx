"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { hasPermission, type AppPermission } from "@/lib/permissions";
import { useLang } from "@/lib/i18n";
import { DAILY_WORK_COLOR, dailyWorkColor, dailyWorkLabel } from "@/lib/task-work-type";
import { useDailyWorkCategories } from "@/lib/use-daily-work-categories";

const DAY_WIDTH = 38;
const TASK_COLUMN_WIDTH = 300;

interface Product {
  id: string;
  code: string;
  name: string;
  color: string;
  isActive: boolean;
}

interface Employee {
  id: string;
  employeeCode: string;
  fullName: string;
  isActive: boolean;
  team?: { name: string } | null;
}

interface WaitingTask {
  id: string;
  taskCode: string;
  taskName: string;
  description: string | null;
  workType: "PRODUCT" | "DAILY";
  dailyCategory: string | null;
  productId: string | null;
  product: Product | null;
  plannedStartDate: string;
  plannedEndDate: string;
  priority: string;
  status: string;
  note: string | null;
}

function toDateInput(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index++) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') { value += '"'; index++; }
      else quoted = !quoted;
    } else if (character === "," && !quoted) {
      cells.push(value.trim());
      value = "";
    } else value += character;
  }
  cells.push(value.trim());
  return cells;
}

function escapeCsv(value: unknown) {
  const text = String(value ?? "").replace(/\r?\n/g, " ");
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export default function WaitingTasksPage() {
  const { data: session } = useSession();
  const { lang } = useLang();
  const dailyCategories = useDailyWorkCategories();
  const permissionUser = session?.user as { role: "ADMIN" | "MANAGER" | "EMPLOYEE"; permissions?: AppPermission[] } | undefined;
  const role = permissionUser?.role;
  const allowed = hasPermission(permissionUser, "TASK_ASSIGN");
  const canCreateProduct = hasPermission(permissionUser, "TASK_CREATE");
  const canCreateDaily = hasPermission(permissionUser, "DAILY_TASK_CREATE");
  const canEditProduct = hasPermission(permissionUser, "TASK_EDIT");
  const canEditDaily = hasPermission(permissionUser, "DAILY_TASK_EDIT");
  const canDeleteProduct = hasPermission(permissionUser, "TASK_DELETE");
  const canDeleteDaily = hasPermission(permissionUser, "DAILY_TASK_DELETE");
  const [tasks, setTasks] = useState<WaitingTask[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [employeeId, setEmployeeId] = useState("");
  const [reason, setReason] = useState("");
  const [search, setSearch] = useState("");
  const [productFilter, setProductFilter] = useState("");
  const [workTypeFilter, setWorkTypeFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [collapsedProducts, setCollapsedProducts] = useState<Set<string>>(() => new Set());
  const [showCreate, setShowCreate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [form, setForm] = useState({
    workType: "PRODUCT",
    dailyCategory: "",
    dailyCategoryCustom: "",
    productId: "",
    taskNumber: "",
    taskName: "",
    description: "",
    plannedStartDate: "",
    plannedEndDate: "",
    priority: "MEDIUM",
    note: "",
  });

  const effectiveCreateWorkType = form.workType === "PRODUCT" && canCreateProduct
    ? "PRODUCT"
    : form.workType === "DAILY" && canCreateDaily
      ? "DAILY"
      : canCreateProduct ? "PRODUCT" : "DAILY";

  const text = lang === "ja" ? {
    title: "未割り当てタスク",
    description: "担当者を決める前のタスクを作成・確認し、まとめて割り当てます。",
    create: "未割り当てタスクを作成",
    import: "CSVインポート",
    export: "CSVエクスポート",
    search: "コードまたはタスク名を検索...",
    allProducts: "すべての製品",
    allPriorities: "すべての優先度",
    task: "タスク",
    product: "製品",
    start: "開始日",
    end: "終了日",
    priority: "優先度",
    actions: "操作",
    edit: "編集",
    delete: "削除",
    empty: "未割り当てタスクはありません。",
    selected: "選択済み",
    employee: "担当者を選択",
    reason: "割り当て理由（任意）",
    assign: "選択したタスクを割り当て",
    timeline: "未割り当てタスクのスケジュール",
    previous: "← 前へ",
    next: "次へ →",
    today: "今月",
    expandAll: "すべて展開",
    collapseAll: "すべて折りたたむ",
    noTimeline: "この月に未割り当てタスクはありません。",
    taskName: "タスク名",
    suffix: "タスクコードの末尾",
    descriptionField: "説明",
    note: "備考",
    save: "保存",
    cancel: "キャンセル",
    creating: "作成中...",
  } : {
    title: "Task chờ phân công",
    description: "Tạo và kiểm tra task chưa có người phụ trách, sau đó phân công hàng loạt.",
    create: "Tạo task chờ",
    import: "Import CSV",
    export: "Export CSV",
    search: "Tìm mã hoặc tên task...",
    allProducts: "Tất cả sản phẩm",
    allPriorities: "Tất cả ưu tiên",
    task: "Task",
    product: "Sản phẩm",
    start: "Bắt đầu",
    end: "Kết thúc",
    priority: "Ưu tiên",
    actions: "Thao tác",
    edit: "Sửa",
    delete: "Xóa",
    empty: "Không có task nào đang chờ phân công.",
    selected: "Đã chọn",
    employee: "Chọn nhân viên",
    reason: "Lý do phân công (không bắt buộc)",
    assign: "Phân công task đã chọn",
    timeline: "Lịch task chờ",
    previous: "← Trước",
    next: "Tiếp →",
    today: "Tháng này",
    expandAll: "Mở rộng tất cả",
    collapseAll: "Thu gọn tất cả",
    noTimeline: "Tháng này không có task chờ.",
    taskName: "Tên task",
    suffix: "Phần sau mã task",
    descriptionField: "Mô tả",
    note: "Ghi chú",
    save: "Lưu task chờ",
    cancel: "Hủy",
    creating: "Đang tạo...",
  };

  async function loadTasks() {
    const response = await fetch("/api/tasks?assignment=unassigned&page=1&pageSize=100");
    const json = await response.json();
    if (json.success) setTasks(json.data.tasks);
    setSelectedIds(new Set());
  }

  useEffect(() => {
    if (!allowed) return;
    let cancelled = false;
    Promise.all([
      fetch("/api/tasks?assignment=unassigned&page=1&pageSize=100").then((response) => response.json()),
      fetch("/api/products").then((response) => response.json()),
      fetch("/api/employees?pageSize=100&isActive=true").then((response) => response.json()),
    ]).then(([taskJson, productJson, employeeJson]) => {
      if (cancelled) return;
      if (taskJson.success) setTasks(taskJson.data.tasks);
      if (productJson.success) setProducts(productJson.data);
      if (employeeJson.success) setEmployees(employeeJson.data.employees);
    });
    return () => { cancelled = true; };
  }, [allowed]);

  const filteredTasks = useMemo(() => tasks.filter((task) => {
    const keyword = search.trim().toLowerCase();
    return (!keyword || task.taskCode.toLowerCase().includes(keyword) || task.taskName.toLowerCase().includes(keyword))
      && (!productFilter || task.productId === productFilter)
      && (!workTypeFilter || task.workType === workTypeFilter)
      && (!priorityFilter || task.priority === priorityFilter);
  }), [tasks, search, productFilter, workTypeFilter, priorityFilter]);

  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const monthStart = new Date(month.getFullYear(), month.getMonth(), 1);
  const monthEnd = new Date(month.getFullYear(), month.getMonth(), daysInMonth, 23, 59, 59);
  const timelineTasks = filteredTasks.filter((task) => {
    const start = new Date(task.plannedStartDate);
    const end = new Date(task.plannedEndDate);
    return start <= monthEnd && end >= monthStart;
  });
  const productGroups = [
    ...products,
    { id: "__daily__", code: "DAILY", name: lang === "ja" ? "日常業務" : "Công việc hằng ngày", color: DAILY_WORK_COLOR, isActive: true },
  ]
    .map((product) => ({ product, tasks: timelineTasks.filter((task) => product.id === "__daily__" ? task.workType === "DAILY" : task.productId === product.id) }))
    .filter((group) => group.tasks.length > 0);
  const allVisibleSelected = filteredTasks.length > 0 && filteredTasks.every((task) => selectedIds.has(task.id));
  const selectedCount = selectedIds.size;

  function toggleTask(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllVisible() {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (allVisibleSelected) filteredTasks.forEach((task) => next.delete(task.id));
      else filteredTasks.forEach((task) => next.add(task.id));
      return next;
    });
  }

  async function createWaitingTask(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const response = await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, workType: effectiveCreateWorkType, dailyCategory: effectiveCreateWorkType === "DAILY" ? (form.dailyCategory === "__CUSTOM__" ? form.dailyCategoryCustom : form.dailyCategory) : null, plannedEndDate: form.plannedEndDate || null, assigneeId: "", status: "PLANNED" }),
    });
    const json = await response.json();
    setBusy(false);
    if (!json.success) {
      setMessage(json.error?.message || (lang === "ja" ? "タスクを作成できません。" : "Không thể tạo task chờ."));
      return;
    }
    setForm({ workType: canCreateProduct ? "PRODUCT" : "DAILY", dailyCategory: "", dailyCategoryCustom: "", productId: "", taskNumber: "", taskName: "", description: "", plannedStartDate: "", plannedEndDate: "", priority: "MEDIUM", note: "" });
    setShowCreate(false);
    setMessage(lang === "ja" ? "未割り当てタスクを作成しました。" : "Đã tạo task chờ.");
    await loadTasks();
  }

  async function deleteTask(id: string) {
    if (!confirm(lang === "ja" ? "この未割り当てタスクを削除しますか？" : "Xóa task chờ này?")) return;
    await fetch(`/api/tasks/${id}`, { method: "DELETE" });
    await loadTasks();
  }

  async function assignTasks() {
    if (!employeeId || selectedCount === 0) return;
    setBusy(true);
    setMessage("");
    const response = await fetch("/api/tasks/assign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taskIds: [...selectedIds], employeeId, reason }),
    });
    const json = await response.json();
    setBusy(false);
    if (!json.success) {
      setMessage(json.error?.message || (lang === "ja" ? "割り当てに失敗しました。" : "Phân công thất bại."));
      return;
    }
    const overlapCount = (json.data.overlaps || []).reduce((sum: number, item: { count: number }) => sum + item.count, 0);
    setMessage(lang === "ja"
      ? `${json.data.assigned}件を割り当てました。${overlapCount ? `重複候補：${overlapCount}件。` : "割り当てスケジュールに反映されました。"}`
      : `Đã phân công ${json.data.assigned} task.${overlapCount ? ` Có ${overlapCount} cảnh báo trùng lịch.` : " Task đã chuyển sang Lịch phân công."}`);
    setEmployeeId("");
    setReason("");
    await loadTasks();
  }

  async function importCsv(file: File) {
    const csv = (await file.text()).replace(/^\uFEFF/, "");
    let rows = csv.split(/\r?\n/).filter((line) => line.trim()).map(parseCsvLine);
    if (rows[0]?.[0]?.toLowerCase() === "taskcode") rows = rows.slice(1);
    const response = await fetch("/api/tasks/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rows: rows.map((row) => { const next = [...row]; next[4] = ""; return next; }) }),
    });
    const json = await response.json();
    setMessage(json.success
      ? (lang === "ja" ? `${json.data.imported}件をインポート、${json.data.skipped}件をスキップしました。` : `Đã import ${json.data.imported} task chờ, bỏ qua ${json.data.skipped} dòng.`)
      : (lang === "ja" ? "CSVのインポートに失敗しました。" : "Import CSV thất bại."));
    if (json.success) await loadTasks();
  }

  function exportCsv() {
    const header = ["taskCode", "taskName", "description", "productCode", "assigneeCode", "plannedStartDate", "plannedEndDate", "actualStartDate", "actualEndDate", "status", "progress", "priority", "note", "workType", "dailyCategory"];
    const rows = filteredTasks.map((task) => [task.taskCode, task.taskName, task.description, task.product?.code || "", "", toDateInput(new Date(task.plannedStartDate)), toDateInput(new Date(task.plannedEndDate)), "", "", task.status, 0, task.priority, task.note, task.workType, task.dailyCategory]);
    const blob = new Blob(["\uFEFF", [header, ...rows].map((row) => row.map(escapeCsv).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `waiting-tasks-${toDateInput(new Date())}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function taskBar(task: WaitingTask) {
    const rawStart = new Date(task.plannedStartDate);
    const rawEnd = new Date(task.plannedEndDate);
    const visibleStart = rawStart < monthStart ? monthStart : rawStart;
    const visibleEnd = rawEnd > monthEnd ? monthEnd : rawEnd;
    const startDay = visibleStart.getDate();
    const duration = Math.max(1, Math.round((visibleEnd.getTime() - visibleStart.getTime()) / 86400000) + 1);
    return (
      <Link
        href={`/tasks/${task.id}`}
        title={`${task.taskCode}: ${task.taskName}`}
        className="absolute top-2 flex h-7 items-center overflow-hidden rounded px-2 text-xs font-medium text-white shadow-sm hover:brightness-110"
        style={{ left: (startDay - 1) * DAY_WIDTH + 2, width: duration * DAY_WIDTH - 4, backgroundColor: task.workType === "DAILY" ? dailyWorkColor(task.dailyCategory, dailyCategories) : task.product?.color || "#6B7280" }}
      >
        <span className="truncate">{task.taskCode}: {task.taskName}</span>
      </Link>
    );
  }

  if (role && !allowed) {
    return <div className="p-6"><p className="rounded-lg bg-red-50 p-4 text-red-700">{lang === "ja" ? "この画面へのアクセス権限がありません。" : "Bạn không có quyền truy cập màn hình này."}</p></div>;
  }

  return (
    <div className="space-y-5 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h2 className="text-2xl font-bold text-gray-900">{text.title}</h2><p className="mt-1 text-sm text-gray-500">{text.description}</p></div>
        <div className="flex flex-wrap gap-2">
          {(canCreateProduct || canCreateDaily) && <button type="button" onClick={() => setShowCreate((current) => !current)} className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700">+ {text.create}</button>}
          <label className="cursor-pointer rounded-lg bg-green-600 px-4 py-2 text-sm text-white hover:bg-green-700">📥 {text.import}<input type="file" accept=".csv,text/csv" className="hidden" onChange={async (event) => { const file = event.target.files?.[0]; if (file) await importCsv(file); event.target.value = ""; }} /></label>
          <button type="button" onClick={exportCsv} className="rounded-lg bg-sky-600 px-4 py-2 text-sm text-white hover:bg-sky-700">📤 {text.export}</button>
        </div>
      </div>

      {showCreate && (canCreateProduct || canCreateDaily) && (
        <form onSubmit={createWaitingTask} className="grid gap-4 rounded-lg border bg-white p-5 md:grid-cols-3">
          <label className="space-y-1 text-sm"><span>{lang === "ja" ? "業務タイプ" : "Loại công việc"} *</span><select value={effectiveCreateWorkType} onChange={(event) => setForm({ ...form, workType: event.target.value, productId: "", dailyCategory: "" })} className="w-full rounded border px-3 py-2">{canCreateProduct && <option value="PRODUCT">{lang === "ja" ? "製品タスク" : "Task sản phẩm"}</option>}{canCreateDaily && <option value="DAILY">{lang === "ja" ? "日常業務" : "Công việc hằng ngày"}</option>}</select></label>
          {effectiveCreateWorkType === "PRODUCT" ? (
            <label className="space-y-1 text-sm"><span>{text.product} *</span><select required value={form.productId} onChange={(event) => setForm({ ...form, productId: event.target.value })} className="w-full rounded border px-3 py-2"><option value="">{text.product}...</option>{products.filter((product) => product.isActive).map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select></label>
          ) : (
            <label className="space-y-1 text-sm"><span>{lang === "ja" ? "業務カテゴリ" : "Nhóm công việc"} *</span><select required value={form.dailyCategory} onChange={(event) => setForm({ ...form, dailyCategory: event.target.value })} className="w-full rounded border px-3 py-2"><option value="">{lang === "ja" ? "カテゴリを選択..." : "Chọn nhóm công việc..."}</option>{dailyCategories.filter((category) => category.isActive !== false).map((category) => <option key={category.code} value={category.code}>{dailyWorkLabel(category.code, lang, dailyCategories)}</option>)}<option value="__CUSTOM__">{lang === "ja" ? "その他（入力）" : "Khác (tự nhập)"}</option></select>{form.dailyCategory === "__CUSTOM__" && <input required maxLength={100} value={form.dailyCategoryCustom} onChange={(event) => setForm({ ...form, dailyCategoryCustom: event.target.value })} className="w-full rounded border px-3 py-2" placeholder={lang === "ja" ? "業務カテゴリを入力..." : "Nhập nhóm công việc..."} />}</label>
          )}
          <label className="space-y-1 text-sm"><span>{text.suffix}</span><input value={form.taskNumber} onChange={(event) => setForm({ ...form, taskNumber: event.target.value })} pattern="[A-Za-z0-9]+([._-][A-Za-z0-9]+)*" maxLength={40} className="w-full rounded border px-3 py-2" placeholder="2.22.4" /></label>
          <label className="space-y-1 text-sm"><span>{text.taskName} *</span><input required maxLength={200} value={form.taskName} onChange={(event) => setForm({ ...form, taskName: event.target.value })} className="w-full rounded border px-3 py-2" /></label>
          <label className="space-y-1 text-sm"><span>{text.start} *</span><input required type="date" value={form.plannedStartDate} onChange={(event) => setForm({ ...form, plannedStartDate: event.target.value })} className="w-full rounded border px-3 py-2" /></label>
          <label className="space-y-1 text-sm"><span>{text.end}</span><input type="date" min={form.plannedStartDate} value={form.plannedEndDate} onChange={(event) => setForm({ ...form, plannedEndDate: event.target.value })} className="w-full rounded border px-3 py-2" /></label>
          <label className="space-y-1 text-sm"><span>{text.priority}</span><select value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value })} className="w-full rounded border px-3 py-2"><option value="LOW">LOW</option><option value="MEDIUM">MEDIUM</option><option value="HIGH">HIGH</option><option value="URGENT">URGENT</option></select></label>
          <label className="space-y-1 text-sm md:col-span-2"><span>{text.descriptionField}</span><textarea rows={2} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} className="w-full rounded border px-3 py-2" /></label>
          <label className="space-y-1 text-sm"><span>{text.note}</span><textarea rows={2} value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} className="w-full rounded border px-3 py-2" /></label>
          <div className="flex gap-2 md:col-span-3"><button disabled={busy} className="rounded bg-blue-600 px-4 py-2 text-sm text-white disabled:opacity-50">{busy ? text.creating : text.save}</button><button type="button" onClick={() => setShowCreate(false)} className="rounded border px-4 py-2 text-sm">{text.cancel}</button></div>
        </form>
      )}

      {message && <p className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">{message}</p>}

      <section className="overflow-hidden rounded-lg border bg-white">
        <div className="flex flex-wrap gap-2 border-b p-4">
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={text.search} className="min-w-52 flex-1 rounded border px-3 py-2 text-sm" />
          <select value={workTypeFilter} onChange={(event) => { setWorkTypeFilter(event.target.value); if (event.target.value === "DAILY") setProductFilter(""); }} className="rounded border px-3 py-2 text-sm"><option value="">{lang === "ja" ? "すべての業務" : "Tất cả công việc"}</option><option value="PRODUCT">{lang === "ja" ? "製品タスク" : "Task sản phẩm"}</option><option value="DAILY">{lang === "ja" ? "日常業務" : "Công việc hằng ngày"}</option></select>
          <select value={productFilter} disabled={workTypeFilter === "DAILY"} onChange={(event) => { setProductFilter(event.target.value); if (event.target.value) setWorkTypeFilter("PRODUCT"); }} className="rounded border px-3 py-2 text-sm disabled:opacity-50"><option value="">{text.allProducts}</option>{products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select>
          <select value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value)} className="rounded border px-3 py-2 text-sm"><option value="">{text.allPriorities}</option><option value="LOW">LOW</option><option value="MEDIUM">MEDIUM</option><option value="HIGH">HIGH</option><option value="URGENT">URGENT</option></select>
        </div>
        {filteredTasks.length === 0 ? <p className="p-8 text-center text-sm text-gray-500">{text.empty}</p> : <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-gray-50 text-left text-gray-600"><tr><th className="px-4 py-3"><input type="checkbox" checked={allVisibleSelected} onChange={toggleAllVisible} /></th><th className="px-4 py-3">{text.task}</th><th className="px-4 py-3">{lang === "ja" ? "業務区分" : "Loại công việc"}</th><th className="px-4 py-3">{text.start}</th><th className="px-4 py-3">{text.end}</th><th className="px-4 py-3">{text.priority}</th><th className="px-4 py-3">{text.actions}</th></tr></thead><tbody className="divide-y">{filteredTasks.map((task) => { const canEditTask = task.workType === "DAILY" ? canEditDaily : canEditProduct; const canDeleteTask = task.workType === "DAILY" ? canDeleteDaily : canDeleteProduct; return <tr key={task.id} className="hover:bg-gray-50"><td className="px-4 py-3"><input type="checkbox" checked={selectedIds.has(task.id)} onChange={() => toggleTask(task.id)} /></td><td className="px-4 py-3"><Link href={`/tasks/${task.id}`} className="font-mono text-xs text-blue-600 hover:underline">{task.taskCode}</Link><p className="mt-0.5 text-sm text-gray-900">{task.taskName}</p></td><td className="px-4 py-3"><span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: task.workType === "DAILY" ? dailyWorkColor(task.dailyCategory, dailyCategories) : task.product?.color || "#6B7280" }} />{task.workType === "DAILY" ? dailyWorkLabel(task.dailyCategory, lang, dailyCategories) : task.product?.name}</span></td><td className="whitespace-nowrap px-4 py-3 text-xs">{toDateInput(new Date(task.plannedStartDate))}</td><td className="whitespace-nowrap px-4 py-3 text-xs">{toDateInput(new Date(task.plannedEndDate))}</td><td className="px-4 py-3 text-xs">{task.priority}</td><td className="whitespace-nowrap px-4 py-3">{canEditTask && <Link href={`/tasks/${task.id}`} className="mr-3 text-blue-600 hover:underline">{text.edit}</Link>}{canDeleteTask && <button type="button" onClick={() => deleteTask(task.id)} className="text-red-600 hover:underline">{text.delete}</button>}</td></tr>; })}</tbody></table></div>}
        <div className="grid rounded-b-lg border-t bg-gray-50 p-4 gap-3 md:grid-cols-[auto_1fr_1fr_auto]"><span className="self-center text-sm font-medium">{text.selected}: {selectedCount}</span><select value={employeeId} onChange={(event) => setEmployeeId(event.target.value)} className="rounded border bg-white px-3 py-2 text-sm"><option value="">{text.employee}...</option>{employees.filter((employee) => employee.isActive).map((employee) => <option key={employee.id} value={employee.id}>{employee.fullName} ({employee.employeeCode}){employee.team?.name ? ` — ${employee.team.name}` : ""}</option>)}</select><input value={reason} onChange={(event) => setReason(event.target.value)} placeholder={text.reason} className="rounded border bg-white px-3 py-2 text-sm" /><button type="button" disabled={busy || !employeeId || selectedCount === 0} onClick={assignTasks} className="rounded bg-green-600 px-4 py-2 text-sm text-white disabled:opacity-40">{text.assign} ({selectedCount})</button></div>
      </section>

      <section className="rounded-lg border bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4"><h3 className="font-semibold text-gray-900">{text.timeline}</h3><div className="flex flex-wrap gap-2"><button type="button" onClick={() => setCollapsedProducts(new Set())} className="rounded border px-2 py-1 text-xs">{text.expandAll}</button><button type="button" onClick={() => setCollapsedProducts(new Set(productGroups.map((group) => group.product.id)))} className="rounded border px-2 py-1 text-xs">{text.collapseAll}</button><button type="button" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} className="rounded border px-3 py-1.5 text-sm">{text.previous}</button><button type="button" onClick={() => setMonth(new Date())} className="rounded border px-3 py-1.5 text-sm">{text.today}</button><span data-i18n-ignore className="min-w-24 self-center text-center font-semibold">{month.getMonth() + 1}/{month.getFullYear()}</span><button type="button" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} className="rounded border px-3 py-1.5 text-sm">{text.next}</button></div></div>
        {productGroups.length === 0 ? <p className="p-8 text-center text-sm text-gray-500">{text.noTimeline}</p> : <div className="overflow-x-auto"><div style={{ minWidth: TASK_COLUMN_WIDTH + daysInMonth * DAY_WIDTH }}><div className="sticky top-0 z-10 flex border-b bg-gray-50"><div className="shrink-0 border-r px-4 py-3 text-sm font-medium" style={{ width: TASK_COLUMN_WIDTH }}>{text.task}</div>{Array.from({ length: daysInMonth }, (_, index) => { const date = new Date(month.getFullYear(), month.getMonth(), index + 1); const today = toDateInput(date) === toDateInput(new Date()); return <div key={index} className={`shrink-0 border-r py-1 text-center text-xs ${today ? "bg-blue-100 font-bold text-blue-700" : ""}`} style={{ width: DAY_WIDTH }}><div>{index + 1}</div><div className="text-[10px] text-gray-400">{date.toLocaleDateString(lang === "ja" ? "ja-JP" : "vi-VN", { weekday: "short" })}</div></div>; })}</div>{productGroups.map(({ product, tasks: groupTasks }) => { const collapsed = collapsedProducts.has(product.id); return <div key={product.id}><button type="button" onClick={() => setCollapsedProducts((current) => { const next = new Set(current); if (next.has(product.id)) next.delete(product.id); else next.add(product.id); return next; })} className="flex w-full items-center gap-2 border-b bg-gray-100 px-4 py-2 text-left text-sm font-semibold hover:bg-gray-50"><span>{collapsed ? "▸" : "▾"}</span><span className="h-3 w-3 rounded-full" style={{ backgroundColor: product.color }} /><span>{product.name}</span><span className="text-xs font-normal text-gray-500">({groupTasks.length} task)</span></button>{!collapsed && groupTasks.map((task) => <div key={task.id} className="flex border-b"><div className="shrink-0 border-r px-4 py-2" style={{ width: TASK_COLUMN_WIDTH }}><Link href={`/tasks/${task.id}`} className="block truncate font-mono text-xs text-blue-600 hover:underline">{task.taskCode}</Link><p className="truncate text-xs text-gray-500">{task.taskName}</p></div><div className="relative h-11" style={{ width: daysInMonth * DAY_WIDTH, backgroundImage: `repeating-linear-gradient(to right, transparent 0, transparent ${DAY_WIDTH - 1}px, var(--color-gray-200) ${DAY_WIDTH - 1}px, var(--color-gray-200) ${DAY_WIDTH}px)` }}>{taskBar(task)}</div></div>)}</div>; })}</div></div>}
      </section>
    </div>
  );
}
