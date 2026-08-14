"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { useLang } from "@/lib/i18n";
import { hasPermission, type AppPermission } from "@/lib/permissions";
import { DAILY_WORK_COLOR, dailyWorkLabel } from "@/lib/task-work-type";

type NippoItemForm = {
  taskId: string | null;
  title: string;
  workContent: string;
  result: string;
  hours: number;
  progressAfter: number | null;
};

type CandidateTask = {
  id: string;
  taskCode: string;
  taskName: string;
  workType: "PRODUCT" | "DAILY";
  dailyCategory: string | null;
  progress: number;
  previousProgress: number;
  product: { name: string; color: string } | null;
};

type TeamMember = {
  id: string;
  employeeCode: string;
  fullName: string;
  report: any | null;
  absence: any | null;
};

type TeamNippoSummary = {
  id: string;
  name: string;
  icon: string | null;
  members: number;
  submitted: number;
  draft: number;
  absent: number;
  missing: number;
  totalHours: number;
};

type NippoOverview = {
  teams: TeamNippoSummary[];
  totals: Omit<TeamNippoSummary, "id" | "name" | "icon">;
};

function localDateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function moveDate(value: string, amount: number) {
  const date = new Date(`${value}T00:00:00`);
  date.setDate(date.getDate() + amount);
  return localDateKey(date);
}

function numberOrNull(value: string) {
  return value === "" ? null : Number(value);
}

export default function NippoPage() {
  const { data: session } = useSession();
  const { lang } = useLang();
  const user = session?.user as { role: "ADMIN" | "MANAGER" | "EMPLOYEE"; permissions?: AppPermission[] } | undefined;
  const canView = hasPermission(user, "NIPPO_VIEW");
  const canSubmit = hasPermission(user, "NIPPO_SUBMIT");
  const canManage = hasPermission(user, "NIPPO_MANAGE");
  const [selectedMode, setMode] = useState<"mine" | "overview" | "team" | null>(null);
  const mode = selectedMode ?? (user?.role === "ADMIN" ? "overview" : "mine");
  const [date, setDate] = useState(localDateKey);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [myEmployee, setMyEmployee] = useState<any>(null);
  const [myAbsence, setMyAbsence] = useState<any>(null);
  const [candidateTasks, setCandidateTasks] = useState<CandidateTask[]>([]);
  const [items, setItems] = useState<NippoItemForm[]>([]);
  const [reportStatus, setReportStatus] = useState<"DRAFT" | "SUBMITTED">("DRAFT");
  const [editingSubmitted, setEditingSubmitted] = useState(false);
  const [summary, setSummary] = useState("");
  const [teams, setTeams] = useState<any[]>([]);
  const [overviewData, setOverviewData] = useState<NippoOverview | null>(null);
  const [overviewTeams, setOverviewTeams] = useState<Record<string, { team: any; members: TeamMember[] }>>({});
  const [expandedOverviewTeams, setExpandedOverviewTeams] = useState<Set<string>>(() => new Set());
  const [expandedOverviewMembers, setExpandedOverviewMembers] = useState<Set<string>>(() => new Set());
  const [loadingOverviewTeams, setLoadingOverviewTeams] = useState<Set<string>>(() => new Set());
  const [teamId, setTeamId] = useState("");
  const [teamData, setTeamData] = useState<{ team: any; members: TeamMember[] } | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [showAbsences, setShowAbsences] = useState(true);
  const [absenceForm, setAbsenceForm] = useState({ employeeId: "", absenceType: "PAID", period: "FULL", reason: "" });

  const text = lang === "ja" ? {
    title: "日報", mine: "自分の日報", overview: "全チーム集計", team: "チーム日報", previous: "← 前日", next: "翌日 →", today: "今日",
    employeeRequired: "このアカウントは社員情報に連携されていないため、日報を作成できません。", error: "日報を読み込めません。",
    candidate: "当日の担当タスク", add: "追加", added: "追加済み", noTask: "当日の担当タスクはありません。",
    details: "報告内容", task: "タスク／業務", content: "本日の作業内容", hours: "時間", progress: "進捗率", result: "結果",
    manual: "+ 一覧外の業務を追加", summary: "本日のまとめ",
    draft: "下書き保存", submit: "提出", editReport: "編集", deleteReport: "削除", saved: "日報を保存しました。", deleted: "日報を削除しました。", confirmDelete: "この日報を削除しますか？", totalHours: "合計時間", overHours: "合計時間が24時間を超えています。入力内容を確認してください。",
    chooseTeam: "チームを選択", submitted: "提出済み", draftStatus: "下書き", missing: "未提出", absent: "休暇",
    members: "社員", teams: "チーム", draftCount: "下書き", detailsButton: "詳細を見る", noTeam: "チームがありません。", noMember: "このチームには社員がいません。", loadingTeam: "チームの日報を読み込み中...", expandAll: "すべて展開", collapseAll: "すべて折りたたむ", onlyMissing: "未提出のみ", showAbsences: "休暇者を表示",
    markAbsence: "休暇者を登録", absenceType: "休暇種別", period: "期間", reason: "理由（任意）", saveAbsence: "登録", removeAbsence: "休暇を解除",
    paid: "有給", sick: "病気", personal: "私用", other: "その他", full: "全日", halfAm: "午前半休", halfPm: "午後半休",
  } : {
    title: "Báo cáo hàng ngày", mine: "Báo cáo của tôi", overview: "Tổng hợp các nhóm", team: "Báo cáo theo nhóm", previous: "← Ngày trước", next: "Ngày tiếp →", today: "Hôm nay",
    employeeRequired: "Tài khoản chưa liên kết với nhân viên nên không thể tạo báo cáo hàng ngày.", error: "Không thể tải báo cáo hàng ngày.",
    candidate: "Task được phân công trong ngày", add: "Thêm", added: "Đã thêm", noTask: "Không có task được phân công trong ngày này.",
    details: "Nội dung báo cáo", task: "Task / Công việc", content: "Nội dung đã làm hôm nay", hours: "Số giờ", progress: "Tiến độ", result: "Kết quả",
    manual: "+ Thêm công việc ngoài danh sách", summary: "Tổng kết hôm nay",
    draft: "Lưu nháp", submit: "Gửi báo cáo", editReport: "Sửa báo cáo", deleteReport: "Xóa báo cáo", saved: "Đã lưu báo cáo hàng ngày.", deleted: "Đã xóa báo cáo hàng ngày.", confirmDelete: "Bạn có chắc muốn xóa báo cáo hàng ngày này?", totalHours: "Tổng số giờ", overHours: "Tổng thời gian đang vượt quá 24 giờ, hãy kiểm tra lại.",
    chooseTeam: "Chọn nhóm", submitted: "Đã gửi", draftStatus: "Bản nháp", missing: "Chưa gửi", absent: "Nghỉ",
    members: "thành viên", teams: "Nhóm", draftCount: "Bản nháp", detailsButton: "Xem chi tiết", noTeam: "Chưa có nhóm nào.", noMember: "Nhóm chưa có thành viên.", loadingTeam: "Đang tải báo cáo của nhóm...", expandAll: "Mở tất cả", collapseAll: "Thu gọn tất cả", onlyMissing: "Chỉ người chưa gửi", showAbsences: "Hiện người nghỉ",
    markAbsence: "Ghi nhận người nghỉ", absenceType: "Loại nghỉ", period: "Thời gian nghỉ", reason: "Lý do (không bắt buộc)", saveAbsence: "Ghi nhận", removeAbsence: "Xóa trạng thái nghỉ",
    paid: "Nghỉ phép", sick: "Nghỉ ốm", personal: "Việc riêng", other: "Khác", full: "Cả ngày", halfAm: "Nửa ngày sáng", halfPm: "Nửa ngày chiều",
  };

  const loadMine = useCallback(async () => {
    setLoading(true); setMessage("");
    const response = await fetch(`/api/nippo?mode=mine&date=${date}`);
    const json = await response.json();
    setLoading(false);
    if (!json.success) { setMyEmployee(null); setMessage(json.error?.code === "EMPLOYEE_REQUIRED" ? text.employeeRequired : text.error); return; }
    const report = json.data.report;
    setMyEmployee(json.data.employee); setMyAbsence(json.data.absence); setCandidateTasks(json.data.candidateTasks || []);
    setItems((report?.items || []).map((item: any) => ({
      taskId: item.taskId, title: item.title, workContent: item.workContent || "", result: item.result || "",
      hours: item.hours || 0, progressAfter: item.progressAfter,
    })));
    setReportStatus(report?.status || "DRAFT"); setEditingSubmitted(false); setSummary(report?.summary || "");
  }, [date, text.employeeRequired, text.error]);

  const loadTeam = useCallback(async () => {
    if (!teamId) return;
    setLoading(true); setMessage("");
    const response = await fetch(`/api/nippo?mode=team&date=${date}&teamId=${encodeURIComponent(teamId)}`);
    const json = await response.json(); setLoading(false);
    if (json.success) setTeamData(json.data); else setMessage(text.error);
  }, [date, teamId, text.error]);

  const loadOverview = useCallback(async () => {
    setLoading(true); setMessage("");
    const response = await fetch(`/api/nippo?mode=overview&date=${date}`);
    const json = await response.json(); setLoading(false);
    if (json.success) {
      setOverviewData(json.data);
      setOverviewTeams({});
      setExpandedOverviewTeams(new Set());
      setExpandedOverviewMembers(new Set());
    } else setMessage(text.error);
  }, [date, text.error]);

  async function toggleOverviewTeam(id: string) {
    if (expandedOverviewTeams.has(id)) {
      setExpandedOverviewTeams((current) => { const next = new Set(current); next.delete(id); return next; });
      return;
    }
    setExpandedOverviewTeams((current) => new Set(current).add(id));
    const cacheKey = `${date}:${id}`;
    if (overviewTeams[cacheKey] || loadingOverviewTeams.has(cacheKey)) return;
    setLoadingOverviewTeams((current) => new Set(current).add(cacheKey));
    const response = await fetch(`/api/nippo?mode=team&date=${date}&teamId=${encodeURIComponent(id)}`);
    const json = await response.json();
    setLoadingOverviewTeams((current) => { const next = new Set(current); next.delete(cacheKey); return next; });
    if (json.success) setOverviewTeams((current) => ({ ...current, [cacheKey]: json.data })); else setMessage(text.error);
  }

  function toggleOverviewMember(id: string) {
    setExpandedOverviewMembers((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  }

  useEffect(() => { if (canManage) fetch("/api/teams").then((response) => response.json()).then((json) => { if (json.success) { setTeams(json.data); setTeamId((current) => current || json.data[0]?.id || ""); } }); }, [canManage]);
  useEffect(() => {
    if (!canView || mode !== "mine") return;
    const timer = window.setTimeout(() => void loadMine(), 0);
    return () => window.clearTimeout(timer);
  }, [canView, mode, loadMine]);
  useEffect(() => {
    if (!canManage || mode !== "team") return;
    const timer = window.setTimeout(() => void loadTeam(), 0);
    return () => window.clearTimeout(timer);
  }, [canManage, mode, loadTeam]);
  useEffect(() => {
    if (user?.role !== "ADMIN" || mode !== "overview") return;
    const timer = window.setTimeout(() => void loadOverview(), 0);
    return () => window.clearTimeout(timer);
  }, [user?.role, mode, loadOverview]);

  const totalHours = items.reduce((sum, item) => sum + (Number(item.hours) || 0), 0);
  const formLocked = reportStatus === "SUBMITTED" && !editingSubmitted;
  const addedTaskIds = new Set(items.flatMap((item) => item.taskId ? [item.taskId] : []));

  function addTask(task: CandidateTask) {
    if (addedTaskIds.has(task.id)) return;
    setItems((current) => [...current, {
      taskId: task.id, title: `${task.taskCode}: ${task.taskName}`, workContent: "", result: "", hours: 0,
      progressAfter: task.previousProgress,
    }]);
  }

  function addManualItem() {
    setItems((current) => [...current, { taskId: null, title: "", workContent: "", result: "", hours: 0, progressAfter: null }]);
  }

  function updateItem(index: number, value: Partial<NippoItemForm>) {
    setItems((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...value } : item));
  }

  async function saveReport(status: "DRAFT" | "SUBMITTED") {
    if (items.some((item) => !item.title.trim())) { setMessage(lang === "ja" ? "業務名を入力してください。" : "Hãy nhập tên cho các công việc bổ sung."); return; }
    setSaving(true); setMessage("");
    const response = await fetch("/api/nippo", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reportDate: date, status, summary, items }) });
    const json = await response.json(); setSaving(false);
    if (!json.success) { setMessage(lang === "ja" ? "日報を保存できません。" : "Không thể lưu báo cáo hàng ngày."); return; }
    await loadMine(); setEditingSubmitted(false); setMessage(text.saved);
  }

  async function deleteReport() {
    if (!window.confirm(text.confirmDelete)) return;
    setSaving(true);
    const response = await fetch(`/api/nippo?date=${date}`, { method: "DELETE" });
    const json = await response.json(); setSaving(false);
    if (!json.success) { setMessage(lang === "ja" ? "日報を削除できません。" : "Không thể xóa báo cáo hàng ngày."); return; }
    await loadMine(); setMessage(text.deleted);
  }

  async function saveAbsence() {
    if (!teamId || !absenceForm.employeeId) return;
    const response = await fetch("/api/nippo/absences", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...absenceForm, teamId, absenceDate: date }) });
    const json = await response.json();
    if (json.success) { setAbsenceForm({ employeeId: "", absenceType: "PAID", period: "FULL", reason: "" }); await loadTeam(); }
  }

  async function removeAbsence(employeeId: string) {
    await fetch(`/api/nippo/absences?employeeId=${encodeURIComponent(employeeId)}&date=${date}`, { method: "DELETE" });
    await loadTeam();
  }

  if (user && !canView) return <div className="p-6"><p className="rounded-lg bg-red-50 p-4 text-red-700">Forbidden</p></div>;

  const absenceLabel = (absence: any) => {
    const types: Record<string, string> = { PAID: text.paid, SICK: text.sick, PERSONAL: text.personal, OTHER: text.other };
    const periods: Record<string, string> = { FULL: text.full, HALF_AM: text.halfAm, HALF_PM: text.halfPm };
    return `${types[absence.absenceType] || absence.absenceType} · ${periods[absence.period] || absence.period}`;
  };

  const visibleMembers = (teamData?.members || []).filter((member) => {
    if (!showAbsences && member.absence) return false;
    if (onlyMissing && (member.report || member.absence)) return false;
    return true;
  });
  const submittedCount = (teamData?.members || []).filter((member) => member.report?.status === "SUBMITTED").length;
  const absentCount = (teamData?.members || []).filter((member) => member.absence).length;
  const missingCount = (teamData?.members || []).filter((member) => !member.report && !member.absence).length;
  const teamHours = (teamData?.members || []).reduce((sum, member) => sum + (member.report?.items || []).reduce((itemSum: number, item: any) => itemSum + item.hours, 0), 0);

  return (
    <div className="space-y-5 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="text-2xl font-bold text-gray-900">{text.title}</h2><p className="mt-1 text-sm text-gray-500">{date}</p></div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => setDate(moveDate(date, -1))} className="rounded border px-3 py-2 text-sm">{text.previous}</button>
          <input type="date" value={date} onChange={(event) => setDate(event.target.value)} className="rounded border px-3 py-2 text-sm" />
          <button onClick={() => setDate(localDateKey())} className="rounded border px-3 py-2 text-sm">{text.today}</button>
          <button onClick={() => setDate(moveDate(date, 1))} className="rounded border px-3 py-2 text-sm">{text.next}</button>
        </div>
      </div>

      {canManage && <div className="inline-flex flex-wrap rounded-lg bg-gray-100 p-1 text-sm">{user?.role === "ADMIN" && <button onClick={() => setMode("overview")} className={`rounded-md px-4 py-2 ${mode === "overview" ? "bg-white font-medium text-blue-700 shadow" : "text-gray-600"}`}>{text.overview}</button>}<button onClick={() => setMode("mine")} className={`rounded-md px-4 py-2 ${mode === "mine" ? "bg-white font-medium text-blue-700 shadow" : "text-gray-600"}`}>{text.mine}</button><button onClick={() => setMode("team")} className={`rounded-md px-4 py-2 ${mode === "team" ? "bg-white font-medium text-blue-700 shadow" : "text-gray-600"}`}>{text.team}</button></div>}
      {message && <p className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">{message}</p>}

      {mode === "mine" ? (
        loading ? <p className="py-12 text-center text-gray-500">Loading...</p> : myEmployee && (
          <div className="space-y-5">
            <div className="rounded-xl border bg-white p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-semibold text-gray-900">{myEmployee.fullName}</h3><p className="text-xs text-gray-500">{myEmployee.employeeCode} · {myEmployee.team?.name || "-"}</p></div><div className="flex flex-wrap items-center gap-2"><div className="rounded-lg bg-blue-50 px-4 py-2 text-center"><p className="text-[11px] text-blue-600">{text.totalHours}</p><p className="text-lg font-bold text-blue-800">{totalHours.toFixed(2)}h</p></div><span className={`rounded-full px-3 py-1 text-xs font-medium ${reportStatus === "SUBMITTED" ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>{reportStatus === "SUBMITTED" ? text.submitted : text.draftStatus}</span>{reportStatus === "SUBMITTED" && !editingSubmitted && <><button onClick={() => setEditingSubmitted(true)} className="rounded border px-3 py-1.5 text-xs text-blue-700">{text.editReport}</button><button disabled={saving} onClick={deleteReport} className="rounded border border-red-200 px-3 py-1.5 text-xs text-red-600">{text.deleteReport}</button></>}</div></div>{myAbsence && <p className="mt-3 rounded bg-orange-50 px-3 py-2 text-sm text-orange-700">{text.absent}: {absenceLabel(myAbsence)}</p>}</div>

            <section className="rounded-xl border bg-white p-5"><h3 className="mb-3 font-semibold text-gray-900">{text.candidate}</h3>{candidateTasks.length === 0 ? <p className="text-sm text-gray-500">{text.noTask}</p> : <div className="grid gap-2 md:grid-cols-2">{candidateTasks.map((task) => <div key={task.id} className="flex items-center gap-3 rounded-lg border p-3"><span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: task.workType === "DAILY" ? DAILY_WORK_COLOR : task.product?.color || "#6B7280" }} /><div className="min-w-0 flex-1"><Link href={`/tasks/${task.id}`} className="block truncate text-sm font-medium text-blue-700 hover:underline">{task.taskCode}: {task.taskName}</Link><p className="text-xs text-gray-500">{task.workType === "DAILY" ? dailyWorkLabel(task.dailyCategory, lang) : task.product?.name} · {task.previousProgress}%</p></div><button disabled={formLocked || addedTaskIds.has(task.id)} onClick={() => addTask(task)} className="rounded border px-2 py-1 text-xs text-blue-700 disabled:text-gray-400">{addedTaskIds.has(task.id) ? text.added : text.add}</button></div>)}</div>}</section>

            <section className="rounded-xl border bg-white p-5"><div className="mb-3 flex flex-wrap items-center justify-between gap-3"><h3 className="font-semibold text-gray-900">{text.details}</h3><div className="rounded-lg bg-blue-50 px-4 py-2 text-sm"><span className="text-blue-600">{text.totalHours}: </span><strong className="text-blue-800">{totalHours.toFixed(2)}h</strong></div></div>{totalHours > 24 && <p className="mb-3 rounded bg-amber-50 px-3 py-2 text-sm text-amber-700">{text.overHours}</p>}<div className="space-y-3">{items.map((item, index) => <div key={`${item.taskId || "manual"}-${index}`} className="grid gap-3 rounded-lg border p-4 lg:grid-cols-12"><label className="text-xs lg:col-span-3"><span className="mb-1 block text-gray-500">{text.task}</span><input readOnly={formLocked || Boolean(item.taskId)} value={item.title} onChange={(event) => updateItem(index, { title: event.target.value })} className="w-full rounded border px-3 py-2 text-sm read-only:bg-gray-50" /></label><label className="text-xs lg:col-span-4"><span className="mb-1 block text-gray-500">{text.content}</span><textarea disabled={formLocked} value={item.workContent} onChange={(event) => updateItem(index, { workContent: event.target.value })} className="min-h-16 w-full rounded border px-3 py-2 text-sm disabled:bg-gray-50" /></label><label className="text-xs lg:col-span-1"><span className="mb-1 block text-gray-500">{text.hours}</span><input disabled={formLocked} type="number" min="0" max="24" step="0.25" value={item.hours} onChange={(event) => updateItem(index, { hours: Number(event.target.value) })} className="w-full rounded border px-2 py-2 text-sm disabled:bg-gray-50" /></label><label className="text-xs lg:col-span-1"><span className="mb-1 block text-gray-500">{text.progress} %</span><input disabled={formLocked} type="number" min="0" max="100" value={item.progressAfter ?? ""} onChange={(event) => updateItem(index, { progressAfter: numberOrNull(event.target.value) })} className="w-full rounded border px-2 py-2 text-sm disabled:bg-gray-50" /></label><label className="text-xs lg:col-span-2"><span className="mb-1 block text-gray-500">{text.result}</span><textarea disabled={formLocked} value={item.result} onChange={(event) => updateItem(index, { result: event.target.value })} className="min-h-16 w-full rounded border px-3 py-2 text-sm disabled:bg-gray-50" /></label>{!formLocked && <button onClick={() => setItems((current) => current.filter((_, itemIndex) => itemIndex !== index))} className="self-start text-sm text-red-600">×</button>}</div>)}</div>{!formLocked && <button onClick={addManualItem} className="mt-3 rounded border border-dashed px-3 py-2 text-sm text-purple-700">{text.manual}</button>}</section>

            <section className="rounded-xl border bg-white p-5"><label className="text-sm"><span className="mb-1 block text-gray-600">{text.summary}</span><textarea disabled={formLocked} value={summary} onChange={(event) => setSummary(event.target.value)} className="min-h-24 w-full rounded border px-3 py-2 disabled:bg-gray-50" /></label></section>
            {canSubmit && !formLocked && <div className="flex justify-end gap-3">{editingSubmitted && <button disabled={saving} onClick={() => loadMine()} className="rounded-lg border px-5 py-2 text-sm">{lang === "ja" ? "キャンセル" : "Hủy sửa"}</button>}<button disabled={saving} onClick={() => saveReport("DRAFT")} className="rounded-lg border px-5 py-2 text-sm">{text.draft}</button><button disabled={saving} onClick={() => saveReport("SUBMITTED")} className="rounded-lg bg-blue-600 px-5 py-2 text-sm text-white">{text.submit}</button></div>}
          </div>
        )
      ) : mode === "overview" ? (
        loading ? <p className="py-12 text-center text-gray-500">Loading...</p> : overviewData && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-semibold text-gray-900">{text.overview}</h3><p className="mt-1 text-xs text-gray-500">{date}</p></div><div className="flex gap-2"><button onClick={() => overviewData.teams.forEach((team) => { if (!expandedOverviewTeams.has(team.id)) void toggleOverviewTeam(team.id); })} className="rounded border px-3 py-2 text-sm">{text.expandAll}</button><button onClick={() => { setExpandedOverviewTeams(new Set()); setExpandedOverviewMembers(new Set()); }} className="rounded border px-3 py-2 text-sm">{text.collapseAll}</button></div></div>
            {overviewData.teams.length === 0 ? <p className="rounded-xl border bg-white p-6 text-sm text-gray-500">{text.noTeam}</p> : <div className="space-y-4">{overviewData.teams.map((team) => {
              const teamExpanded = expandedOverviewTeams.has(team.id);
              const detail = overviewTeams[`${date}:${team.id}`];
              const teamLoading = loadingOverviewTeams.has(`${date}:${team.id}`);
              return <section key={team.id} className="overflow-hidden rounded-xl border bg-white">
                <button onClick={() => void toggleOverviewTeam(team.id)} className="task-team-header flex w-full flex-wrap items-center gap-3 border-b bg-gradient-to-r from-blue-50 to-indigo-50 px-4 py-3 text-left">
                  <span className="text-lg text-blue-700">{teamExpanded ? "▾" : "▸"}</span><span className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600 text-lg text-white">{team.icon || "👥"}</span><div className="min-w-40 flex-1"><p className="font-semibold text-gray-900">{team.name}</p><p className="text-xs text-gray-500">{team.members} {text.members} · {team.totalHours.toFixed(2)}h</p></div>
                  <div className="flex flex-wrap gap-2 text-xs"><span className="rounded-full bg-green-100 px-3 py-1 text-green-700">{text.submitted}: {team.submitted}</span>{team.draft > 0 && <span className="rounded-full bg-yellow-100 px-3 py-1 text-yellow-700">{text.draftCount}: {team.draft}</span>}<span className="rounded-full bg-red-100 px-3 py-1 text-red-700">{text.missing}: {team.missing}</span>{team.absent > 0 && <span className="rounded-full bg-orange-100 px-3 py-1 text-orange-700">{text.absent}: {team.absent}</span>}</div>
                </button>
                {teamExpanded && <div className="space-y-3 p-4">{teamLoading ? <p className="py-6 text-center text-sm text-gray-500">{text.loadingTeam}</p> : !detail ? <p className="py-6 text-center text-sm text-red-700">{text.error}</p> : detail.members.length === 0 ? <p className="py-4 text-sm text-gray-500">{text.noMember}</p> : detail.members.map((member) => {
                  const memberKey = `${team.id}:${member.id}`;
                  const memberExpanded = expandedOverviewMembers.has(memberKey);
                  const memberHours = (member.report?.items || []).reduce((sum: number, item: any) => sum + item.hours, 0);
                  const status = member.absence ? text.absent : member.report?.status === "SUBMITTED" ? text.submitted : member.report ? text.draftStatus : text.missing;
                  return <section key={member.id} className="overflow-hidden rounded-lg border">
                    <button onClick={() => toggleOverviewMember(memberKey)} className="flex w-full items-center gap-3 bg-gray-50 px-4 py-3 text-left"><span>{memberExpanded ? "▾" : "▸"}</span><div className="min-w-0 flex-1"><p className="font-semibold text-gray-900">{member.fullName}</p><p className="text-xs text-gray-500">{member.employeeCode}</p></div><span className={`rounded-full px-3 py-1 text-xs ${member.absence ? "bg-orange-100 text-orange-700" : member.report?.status === "SUBMITTED" ? "bg-green-100 text-green-700" : member.report ? "bg-amber-100 text-amber-700" : "bg-gray-200 text-gray-600"}`}>{status}</span><span className="nippo-member-hours w-24 text-right text-sm font-semibold text-blue-700">{memberHours.toFixed(2)}h</span><span className="w-16 text-right text-xs text-gray-500">{member.report?.items?.length || 0} task</span></button>
                    {memberExpanded && <div className="p-4">{member.absence && <div className="mb-3 rounded bg-orange-50 px-3 py-2 text-sm text-orange-700">{absenceLabel(member.absence)}{member.absence.reason ? ` · ${member.absence.reason}` : ""}</div>}{member.report?.items?.length ? <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-sm"><thead className="bg-gray-50 text-left text-xs text-gray-500"><tr><th className="px-3 py-2">{text.task}</th><th className="px-3 py-2">{text.content}</th><th className="px-3 py-2">{text.hours}</th><th className="px-3 py-2">{text.progress}</th><th className="px-3 py-2">{text.result}</th></tr></thead><tbody className="divide-y">{member.report.items.map((item: any) => <tr key={item.id}><td className="px-3 py-2 font-medium">{item.taskId ? <Link href={`/tasks/${item.taskId}`} className="text-blue-700 hover:underline">{item.title}</Link> : item.title}</td><td className="whitespace-pre-wrap px-3 py-2">{item.workContent || "—"}</td><td className="px-3 py-2 font-semibold">{item.hours}h</td><td className="px-3 py-2 font-semibold">{item.progressAfter == null ? "—" : `${item.progressAfter}%`}</td><td className="whitespace-pre-wrap px-3 py-2">{item.result || "—"}</td></tr>)}</tbody></table></div> : !member.absence && <p className="text-sm text-gray-500">{text.missing}</p>}{member.report && <div className="mt-4 flex flex-wrap items-start justify-between gap-3 border-t pt-4"><div><p className="text-xs text-gray-500">{text.summary}</p><p className="mt-1 whitespace-pre-wrap text-sm">{member.report.summary || "—"}</p></div><div className="rounded-lg bg-blue-50 px-4 py-2 text-right"><p className="text-xs text-blue-600">{text.totalHours}</p><p className="text-lg font-bold text-blue-800">{memberHours.toFixed(2)}h</p></div></div>}</div>}
                  </section>;
                })}</div>}
              </section>;
            })}</div>}
          </div>
        )
      ) : (
        <div className="space-y-5">
          <div className="flex flex-wrap items-end gap-3 rounded-xl border bg-white p-4"><label className="text-sm"><span className="mb-1 block text-xs text-gray-500">{text.chooseTeam}</span><select value={teamId} onChange={(event) => setTeamId(event.target.value)} className="rounded border px-3 py-2"><option value="">{text.chooseTeam}</option>{teams.map((team) => <option key={team.id} value={team.id}>{team.icon} {team.name}</option>)}</select></label><label className="flex items-center gap-2 rounded border px-3 py-2 text-sm"><input type="checkbox" checked={onlyMissing} onChange={(event) => setOnlyMissing(event.target.checked)} />{text.onlyMissing}</label><label className="flex items-center gap-2 rounded border px-3 py-2 text-sm"><input type="checkbox" checked={showAbsences} onChange={(event) => setShowAbsences(event.target.checked)} />{text.showAbsences}</label><button onClick={() => setCollapsed(new Set())} className="rounded border px-3 py-2 text-sm">{text.expandAll}</button><button onClick={() => setCollapsed(new Set((teamData?.members || []).map((member) => member.id)))} className="rounded border px-3 py-2 text-sm">{text.collapseAll}</button></div>
          {teamData && <><div className="grid grid-cols-2 gap-3 md:grid-cols-5">{[[text.members, teamData.members.length], [text.submitted, submittedCount], [text.missing, missingCount], [text.absent, absentCount], [text.totalHours, `${teamHours.toFixed(2)}h`]].map(([label, value]) => <div key={String(label)} className="rounded-xl border bg-white p-4"><p className="text-xs text-gray-500">{label}</p><p className="mt-1 text-2xl font-bold text-gray-900">{value}</p></div>)}</div>
          <section className="rounded-xl border bg-white p-5"><h3 className="mb-3 font-semibold text-gray-900">{text.markAbsence}</h3><div className="flex flex-wrap items-end gap-3"><label className="text-sm"><select value={absenceForm.employeeId} onChange={(event) => setAbsenceForm({ ...absenceForm, employeeId: event.target.value })} className="rounded border px-3 py-2"><option value="">{lang === "ja" ? "社員を選択" : "Chọn nhân viên"}</option>{teamData.members.map((member) => <option key={member.id} value={member.id}>{member.employeeCode} — {member.fullName}</option>)}</select></label><label className="text-sm"><span className="mb-1 block text-xs text-gray-500">{text.absenceType}</span><select value={absenceForm.absenceType} onChange={(event) => setAbsenceForm({ ...absenceForm, absenceType: event.target.value })} className="rounded border px-3 py-2"><option value="PAID">{text.paid}</option><option value="SICK">{text.sick}</option><option value="PERSONAL">{text.personal}</option><option value="OTHER">{text.other}</option></select></label><label className="text-sm"><span className="mb-1 block text-xs text-gray-500">{text.period}</span><select value={absenceForm.period} onChange={(event) => setAbsenceForm({ ...absenceForm, period: event.target.value })} className="rounded border px-3 py-2"><option value="FULL">{text.full}</option><option value="HALF_AM">{text.halfAm}</option><option value="HALF_PM">{text.halfPm}</option></select></label><input value={absenceForm.reason} onChange={(event) => setAbsenceForm({ ...absenceForm, reason: event.target.value })} placeholder={text.reason} className="min-w-56 flex-1 rounded border px-3 py-2 text-sm" /><button onClick={saveAbsence} className="rounded bg-orange-600 px-4 py-2 text-sm text-white">{text.saveAbsence}</button></div></section>
          {loading ? <p className="py-12 text-center text-gray-500">Loading...</p> : <div className="space-y-3">{visibleMembers.map((member) => {
            const isCollapsed = collapsed.has(member.id);
            const itemHours = (member.report?.items || []).reduce((sum: number, item: any) => sum + item.hours, 0);
            const status = member.absence ? text.absent : member.report?.status === "SUBMITTED" ? text.submitted : member.report ? text.draftStatus : text.missing;
            return <section key={member.id} className="overflow-hidden rounded-xl border bg-white">
              <button onClick={() => setCollapsed((current) => { const next = new Set(current); if (next.has(member.id)) next.delete(member.id); else next.add(member.id); return next; })} className="flex w-full items-center gap-3 bg-gray-50 px-4 py-3 text-left">
                <span>{isCollapsed ? "▸" : "▾"}</span><div className="min-w-0 flex-1"><p className="font-semibold text-gray-900">{member.fullName}</p><p className="text-xs text-gray-500">{member.employeeCode}</p></div>
                <span className={`rounded-full px-3 py-1 text-xs ${member.absence ? "bg-orange-100 text-orange-700" : member.report?.status === "SUBMITTED" ? "bg-green-100 text-green-700" : member.report ? "bg-amber-100 text-amber-700" : "bg-gray-200 text-gray-600"}`}>{status}</span>
                <span className="nippo-member-hours w-24 text-right text-sm font-semibold text-blue-700">{itemHours.toFixed(2)}h</span><span className="w-16 text-right text-xs text-gray-500">{member.report?.items?.length || 0} task</span>
              </button>
              {!isCollapsed && <div className="p-4">
                {member.absence && <div className="mb-3 flex items-center justify-between rounded bg-orange-50 px-3 py-2 text-sm text-orange-700"><span>{absenceLabel(member.absence)}{member.absence.reason ? ` · ${member.absence.reason}` : ""}</span><button onClick={() => removeAbsence(member.id)} className="text-xs underline">{text.removeAbsence}</button></div>}
                {member.report?.items?.length ? <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-sm"><thead className="bg-gray-50 text-left text-xs text-gray-500"><tr><th className="px-3 py-2">{text.task}</th><th className="px-3 py-2">{text.content}</th><th className="px-3 py-2">{text.hours}</th><th className="px-3 py-2">{text.progress}</th><th className="px-3 py-2">{text.result}</th></tr></thead><tbody className="divide-y">{member.report.items.map((item: any) => <tr key={item.id}><td className="px-3 py-2 font-medium">{item.taskId ? <Link href={`/tasks/${item.taskId}`} className="text-blue-700 hover:underline">{item.title}</Link> : item.title}</td><td className="whitespace-pre-wrap px-3 py-2">{item.workContent || "—"}</td><td className="px-3 py-2 font-semibold">{item.hours}h</td><td className="px-3 py-2 font-semibold">{item.progressAfter == null ? "—" : `${item.progressAfter}%`}</td><td className="whitespace-pre-wrap px-3 py-2">{item.result || "—"}</td></tr>)}</tbody></table></div> : !member.absence && <p className="text-sm text-gray-500">{text.missing}</p>}
                {member.report && <div className="mt-4 flex flex-wrap items-start justify-between gap-3 border-t pt-4"><div><p className="text-xs text-gray-500">{text.summary}</p><p className="mt-1 whitespace-pre-wrap text-sm">{member.report.summary || "—"}</p></div><div className="rounded-lg bg-blue-50 px-4 py-2 text-right"><p className="text-xs text-blue-600">{text.totalHours}</p><p className="text-lg font-bold text-blue-800">{itemHours.toFixed(2)}h</p></div></div>}
              </div>}
            </section>;
          })}</div>}</>}
        </div>
      )}
    </div>
  );
}
