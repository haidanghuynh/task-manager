"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useLang } from "@/lib/i18n";

type AuditLog = {
  id: string; actorName: string; actorUsername: string; action: string; entityType: string;
  entityId: string | null; entityLabel: string | null; details: unknown; ipAddress: string | null;
  userAgent: string | null; createdAt: string;
};
type Payload = { logs: AuditLog[]; pagination: { page: number; total: number; totalPages: number }; filters: { actions: string[]; entityTypes: string[] } };

const actionNames: Record<string, { vi: string; ja: string }> = {
  CREATE: { vi: "Tạo", ja: "作成" }, UPDATE: { vi: "Cập nhật", ja: "更新" }, DELETE: { vi: "Xóa", ja: "削除" },
  DELETE_ALL: { vi: "Xóa toàn bộ", ja: "一括削除" }, ACTIVATE: { vi: "Kích hoạt", ja: "有効化" }, DEACTIVATE: { vi: "Vô hiệu hóa", ja: "無効化" },
  ASSIGN: { vi: "Phân công", ja: "割り当て" }, REASSIGN: { vi: "Chuyển giao", ja: "再割り当て" }, UNASSIGN: { vi: "Thu hồi về chờ", ja: "割り当て解除" },
  IMPORT: { vi: "Nhập dữ liệu", ja: "インポート" }, COMMENT: { vi: "Bình luận", ja: "コメント" }, SUBMIT: { vi: "Gửi báo cáo", ja: "報告提出" },
  SAVE_DRAFT: { vi: "Lưu nháp", ja: "下書き保存" }, UPSERT: { vi: "Ghi nhận", ja: "登録" }, ADD_MEMBER: { vi: "Thêm thành viên", ja: "メンバー追加" }, REMOVE_MEMBER: { vi: "Xóa thành viên", ja: "メンバー解除" },
};

export default function AuditLogsPage() {
  const { data: session, status } = useSession();
  const { lang } = useLang();
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({ search: "", action: "", entityType: "", from: "", to: "" });
  const [query, setQuery] = useState(filters);
  const role = (session?.user as { role?: string } | undefined)?.role;
  const c = lang === "ja" ? {
    title: "操作履歴", description: "システム上で正常に完了した変更操作を確認します。", denied: "管理者のみ操作履歴を閲覧できます。", search: "ユーザー名・対象を検索", allActions: "すべての操作", allEntities: "すべての対象", from: "開始日", to: "終了日", filter: "検索", reset: "リセット", time: "日時", actor: "操作者", action: "操作", entity: "対象", ip: "IP", details: "詳細", empty: "履歴がありません。", previous: "前へ", next: "次へ", total: "件",
  } : {
    title: "Lịch sử thao tác", description: "Theo dõi các thao tác thay đổi dữ liệu đã thực hiện thành công trong hệ thống.", denied: "Chỉ Admin mới được xem lịch sử thao tác.", search: "Tìm tài khoản hoặc đối tượng", allActions: "Tất cả thao tác", allEntities: "Tất cả đối tượng", from: "Từ ngày", to: "Đến ngày", filter: "Lọc", reset: "Đặt lại", time: "Thời gian", actor: "Người thao tác", action: "Thao tác", entity: "Đối tượng", ip: "IP", details: "Chi tiết", empty: "Chưa có lịch sử thao tác.", previous: "Trước", next: "Tiếp", total: "bản ghi",
  };

  useEffect(() => {
    if (role !== "ADMIN") return;
    let cancelled = false;
    const run = async () => {
      const params = new URLSearchParams({ page: String(page), pageSize: "25" });
      Object.entries(query).forEach(([key, value]) => { if (value) params.set(key, value); });
      const response = await fetch(`/api/audit-logs?${params}`, { cache: "no-store" });
      const json = await response.json();
      if (!cancelled) {
        setData(json.success ? json.data : null);
        setLoading(false);
      }
    };
    void run();
    return () => { cancelled = true; };
  }, [page, query, role]);
  if (status === "loading") return <div className="p-6">...</div>;
  if (role !== "ADMIN") return <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-red-700">{c.denied}</div>;

  return <div className="space-y-5 p-4 sm:p-6">
    <div><h1 className="text-2xl font-bold text-gray-900">{c.title}</h1><p className="mt-1 text-sm text-gray-500">{c.description}</p></div>
    <form onSubmit={(event) => { event.preventDefault(); setPage(1); setQuery(filters); }} className="grid gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm lg:grid-cols-6">
      <input value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.target.value })} placeholder={c.search} className="rounded-lg border border-gray-300 px-3 py-2 text-sm lg:col-span-2" />
      <select value={filters.action} onChange={(e) => setFilters({ ...filters, action: e.target.value })} className="rounded-lg border border-gray-300 px-3 py-2 text-sm"><option value="">{c.allActions}</option>{data?.filters.actions.map((value) => <option key={value} value={value}>{actionNames[value]?.[lang] || value}</option>)}</select>
      <select value={filters.entityType} onChange={(e) => setFilters({ ...filters, entityType: e.target.value })} className="rounded-lg border border-gray-300 px-3 py-2 text-sm"><option value="">{c.allEntities}</option>{data?.filters.entityTypes.map((value) => <option key={value}>{value}</option>)}</select>
      <input type="date" title={c.from} value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} className="rounded-lg border border-gray-300 px-3 py-2 text-sm" />
      <input type="date" title={c.to} value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} className="rounded-lg border border-gray-300 px-3 py-2 text-sm" />
      <div className="flex gap-2 lg:col-span-6"><button className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">{c.filter}</button><button type="button" onClick={() => { const empty = { search: "", action: "", entityType: "", from: "", to: "" }; setFilters(empty); setQuery(empty); setPage(1); }} className="rounded-lg border border-gray-300 px-4 py-2 text-sm">{c.reset}</button></div>
    </form>
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="overflow-x-auto"><table className="min-w-full divide-y divide-gray-200 text-sm"><thead className="bg-gray-50"><tr>{[c.time, c.actor, c.action, c.entity, c.ip, c.details].map((head) => <th key={head} className="whitespace-nowrap px-4 py-3 text-left font-semibold text-gray-600">{head}</th>)}</tr></thead>
        <tbody className="divide-y divide-gray-100">{loading ? <tr><td colSpan={6} className="p-8 text-center text-gray-500">...</td></tr> : !data?.logs.length ? <tr><td colSpan={6} className="p-8 text-center text-gray-500">{c.empty}</td></tr> : data.logs.map((log) => <tr key={log.id} className="align-top hover:bg-gray-50">
          <td className="whitespace-nowrap px-4 py-3 text-gray-600">{new Intl.DateTimeFormat(lang === "ja" ? "ja-JP" : "vi-VN", { dateStyle: "short", timeStyle: "medium" }).format(new Date(log.createdAt))}</td>
          <td className="px-4 py-3"><div className="font-medium text-gray-900">{log.actorName}</div><div className="text-xs text-gray-500">@{log.actorUsername}</div></td>
          <td className="px-4 py-3"><span className="whitespace-nowrap rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">{actionNames[log.action]?.[lang] || log.action}</span></td>
          <td className="px-4 py-3"><div className="font-medium text-gray-800">{log.entityLabel || log.entityId || "-"}</div><div className="text-xs text-gray-500">{log.entityType}</div></td>
          <td className="whitespace-nowrap px-4 py-3 text-gray-500">{log.ipAddress || "-"}</td>
          <td className="max-w-md px-4 py-3">{log.details ? <details><summary className="cursor-pointer text-blue-600">{c.details}</summary><pre data-i18n-ignore className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded-lg bg-gray-50 p-2 text-xs text-gray-700">{JSON.stringify(log.details, null, 2)}</pre></details> : "-"}</td>
        </tr>)}</tbody></table></div>
      {data && <div className="flex items-center justify-between border-t border-gray-200 px-4 py-3 text-sm"><span className="text-gray-500">{data.pagination.total} {c.total}</span><div className="flex items-center gap-2"><button disabled={page <= 1} onClick={() => setPage((v) => v - 1)} className="rounded border border-gray-300 px-3 py-1.5 disabled:opacity-40">{c.previous}</button><span>{page}/{data.pagination.totalPages}</span><button disabled={page >= data.pagination.totalPages} onClick={() => setPage((v) => v + 1)} className="rounded border border-gray-300 px-3 py-1.5 disabled:opacity-40">{c.next}</button></div></div>}
    </div>
  </div>;
}
