"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useLang } from "@/lib/i18n";
import Link from "next/link";
import { History } from "lucide-react";

interface OsOption {
  id: string;
  name: string;
  groupName: string;
  sortOrder: number;
  isActive: boolean;
}

export default function SettingsPage() {
  const { data: session } = useSession();
  const user = session?.user as any;
  const isAdmin = user?.role === "ADMIN";
  const { lang } = useLang();

  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ code: "", name: "", color: "#6B7280" });
  const [dailyCategories, setDailyCategories] = useState<any[]>([]);
  const [showDailyForm, setShowDailyForm] = useState(false);
  const [editingDailyId, setEditingDailyId] = useState<string | null>(null);
  const [dailyForm, setDailyForm] = useState({ code: "", nameVi: "", nameJa: "", color: "#8B5CF6" });
  const [osOptions, setOsOptions] = useState<OsOption[]>([]);
  const [showOsForm, setShowOsForm] = useState(false);
  const [editingOsId, setEditingOsId] = useState<string | null>(null);
  const [osForm, setOsForm] = useState({ name: "", groupName: "Windows", sortOrder: "0", syncExisting: true });

  useEffect(() => { fetchProducts(); fetchDailyCategories(); fetchOsOptions(); }, []);

  async function fetchProducts() {
    setLoading(true);
    const r = await fetch("/api/products");
    const j = await r.json();
    if (j.success) setProducts(j.data);
    setLoading(false);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    await fetch("/api/products", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    setShowForm(false); setForm({ code: "", name: "", color: "#6B7280" }); fetchProducts();
  }

  async function handleUpdate(e: React.FormEvent) {
    e.preventDefault();
    if (!editingId) return;
    await fetch(`/api/products?id=${editingId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    setEditingId(null); setForm({ code: "", name: "", color: "#6B7280" }); fetchProducts();
  }

  async function handleDelete(id: string) {
    if (!confirm("Bạn có chắc muốn xóa/vô hiệu hóa sản phẩm này?")) return;
    await fetch(`/api/products?id=${id}`, { method: "DELETE" });
    fetchProducts();
  }

  async function fetchDailyCategories() {
    const response = await fetch("/api/daily-work-categories");
    const result = await response.json();
    if (result.success) setDailyCategories(result.data);
  }

  async function saveDailyCategory(event: React.FormEvent) {
    event.preventDefault();
    const url = editingDailyId ? `/api/daily-work-categories?id=${editingDailyId}` : "/api/daily-work-categories";
    const response = await fetch(url, { method: editingDailyId ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(dailyForm) });
    const result = await response.json();
    if (!result.success) { alert(lang === "ja" ? "日常業務カテゴリを保存できません。" : "Không thể lưu nhóm công việc hàng ngày."); return; }
    setShowDailyForm(false); setEditingDailyId(null); setDailyForm({ code: "", nameVi: "", nameJa: "", color: "#8B5CF6" });
    fetchDailyCategories();
  }

  function startDailyEdit(category: any) {
    setEditingDailyId(category.id); setShowDailyForm(false);
    setDailyForm({ code: category.code, nameVi: category.nameVi, nameJa: category.nameJa, color: category.color });
  }

  async function deleteDailyCategory(id: string) {
    if (!confirm(lang === "ja" ? "このカテゴリを削除または無効化しますか？" : "Bạn có chắc muốn xóa hoặc vô hiệu hóa nhóm công việc này?")) return;
    await fetch(`/api/daily-work-categories?id=${id}`, { method: "DELETE" });
    fetchDailyCategories();
  }

  async function activateDailyCategory(id: string) {
    await fetch(`/api/daily-work-categories?id=${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ isActive: true }) });
    fetchDailyCategories();
  }

  async function fetchOsOptions() {
    const response = await fetch("/api/test-environment-os");
    const result = await response.json();
    if (result.success) setOsOptions(result.data);
  }

  async function saveOsOption(event: React.FormEvent) {
    event.preventDefault();
    const url = editingOsId ? `/api/test-environment-os?id=${editingOsId}` : "/api/test-environment-os";
    const response = await fetch(url, {
      method: editingOsId ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: osForm.name,
        groupName: osForm.groupName,
        sortOrder: Number.parseInt(osForm.sortOrder, 10) || 0,
        ...(editingOsId ? { syncExisting: osForm.syncExisting } : {}),
      }),
    });
    const result = await response.json();
    if (!result.success) {
      alert(result.error?.code === "DUPLICATE"
        ? (lang === "ja" ? "同じOS名が既に存在します。" : "Tên OS này đã tồn tại.")
        : (lang === "ja" ? "OS設定を保存できません。" : "Không thể lưu cấu hình OS."));
      return;
    }
    const synced = Number(result.data?.syncedEnvironments || 0);
    setShowOsForm(false);
    setEditingOsId(null);
    setOsForm({ name: "", groupName: "Windows", sortOrder: "0", syncExisting: true });
    fetchOsOptions();
    if (synced > 0) {
      alert(lang === "ja" ? `${synced}件の環境のOS名を更新しました。` : `Đã cập nhật tên OS cho ${synced} môi trường.`);
    }
  }

  function startOsEdit(option: OsOption) {
    setEditingOsId(option.id);
    setShowOsForm(false);
    setOsForm({ name: option.name, groupName: option.groupName, sortOrder: String(option.sortOrder), syncExisting: true });
  }

  async function activateOsOption(id: string) {
    await fetch(`/api/test-environment-os?id=${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ isActive: true }) });
    fetchOsOptions();
  }

  async function deleteOsOption(id: string) {
    if (!confirm(lang === "ja" ? "このOSを削除または無効化しますか？" : "Bạn có chắc muốn xóa hoặc vô hiệu hóa OS này?")) return;
    await fetch(`/api/test-environment-os?id=${id}`, { method: "DELETE" });
    fetchOsOptions();
  }

  async function handleActivate(id: string) {
    const response = await fetch(`/api/products?id=${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: true }),
    });
    const result = await response.json();
    if (!result.success) {
      alert(lang === "ja" ? "製品を有効化できません。" : "Không thể kích hoạt lại sản phẩm.");
      return;
    }
    fetchProducts();
  }

  function startEdit(p: any) {
    setEditingId(p.id);
    setForm({ code: p.code, name: p.name, color: p.color });
  }

  if (!isAdmin) {
    return (
      <div className="p-6">
        <h2 data-i18n-ignore className="text-2xl font-bold text-gray-900">{lang === "ja" ? "設定" : "Cài đặt"}</h2>
        <p data-i18n-ignore className="mt-4 p-4 bg-yellow-50 text-yellow-700 rounded-lg">
          {lang === "ja" ? "管理者のみ設定にアクセスできます。" : "Chỉ Admin mới có quyền truy cập cài đặt."}
        </p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <h2 data-i18n-ignore className="text-2xl font-bold text-gray-900">{lang === "ja" ? "設定" : "Cài đặt"}</h2>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Products */}
        <div className="bg-white rounded-lg border p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Sản phẩm</h3>
            <button onClick={() => { setShowForm(!showForm); setEditingId(null); setForm({ code: "", name: "", color: "#6B7280" }); }} className="text-sm text-blue-600 hover:underline">
              + Thêm
            </button>
          </div>

          {(showForm || editingId) && (
            <form onSubmit={editingId ? handleUpdate : handleCreate} className="mb-4 p-3 bg-gray-50 rounded space-y-2">
              <input placeholder="Mã SP (vd: ZONE)" value={form.code} onChange={e => setForm({...form, code: e.target.value})} disabled={!!editingId} className="w-full border rounded px-2 py-1 text-sm" required />
              <input placeholder="Tên sản phẩm" value={form.name} onChange={e => setForm({...form, name: e.target.value})} className="w-full border rounded px-2 py-1 text-sm" required />
              <div className="flex items-center gap-2">
                <input type="color" value={form.color} onChange={e => setForm({...form, color: e.target.value})} className="w-8 h-8 border rounded cursor-pointer" />
                <span className="text-xs text-gray-500">{form.color}</span>
              </div>
              <div className="flex gap-2">
                <button type="submit" className="px-3 py-1 bg-blue-600 text-white rounded text-xs">{editingId ? "Cập nhật" : "Tạo"}</button>
                <button type="button" onClick={() => { setShowForm(false); setEditingId(null); }} className="px-3 py-1 border rounded text-xs">Hủy</button>
              </div>
            </form>
          )}

          <div className="space-y-2">
            {products.map((p: any) => (
              <div key={p.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                <div className="w-4 h-4 rounded-full" style={{ backgroundColor: p.color }} />
                <div className="flex-1">
                  <p className="text-sm font-medium">{p.name}</p>
                  <p className="text-xs text-gray-500">{p.code}</p>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-xs ${p.isActive ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                  {p.isActive ? "Active" : "Inactive"}
                </span>
                <button onClick={() => startEdit(p)} className="text-xs text-blue-600 hover:underline">Sửa</button>
                {!p.isActive && (
                  <button onClick={() => handleActivate(p.id)} className="text-xs text-green-600 hover:underline">
                    {lang === "ja" ? "有効化" : "Kích hoạt"}
                  </button>
                )}
                <button onClick={() => handleDelete(p.id)} className="text-xs text-red-600 hover:underline">Xóa</button>
              </div>
            ))}
          </div>
        </div>

        {/* Daily work categories */}
        <div className="rounded-lg border bg-white p-6">
          <div className="mb-4 flex items-center justify-between">
            <div><h3 data-i18n-ignore className="text-lg font-semibold text-gray-900">{lang === "ja" ? "日常業務カテゴリ" : "Công việc hàng ngày"}</h3><p data-i18n-ignore className="mt-1 text-xs text-gray-500">{lang === "ja" ? "タスク作成時に選択するカテゴリを管理します。" : "Quản lý các nhóm được chọn khi tạo công việc hàng ngày."}</p></div>
            <button data-i18n-ignore onClick={() => { setShowDailyForm(!showDailyForm); setEditingDailyId(null); setDailyForm({ code: "", nameVi: "", nameJa: "", color: "#8B5CF6" }); }} className="text-sm text-blue-600 hover:underline">{lang === "ja" ? "+ 追加" : "+ Thêm"}</button>
          </div>
          {(showDailyForm || editingDailyId) && <form onSubmit={saveDailyCategory} className="mb-4 space-y-2 rounded bg-gray-50 p-3">
            <input data-i18n-ignore required maxLength={50} pattern="[A-Za-z0-9][A-Za-z0-9_-]*" disabled={Boolean(editingDailyId)} value={dailyForm.code} onChange={(event) => setDailyForm({ ...dailyForm, code: event.target.value.toUpperCase() })} placeholder={lang === "ja" ? "コード（例：REVIEW）" : "Mã nhóm (ví dụ: REVIEW)"} className="w-full rounded border px-2 py-1 text-sm disabled:bg-gray-100" />
            <input data-i18n-ignore required maxLength={100} value={dailyForm.nameVi} onChange={(event) => setDailyForm({ ...dailyForm, nameVi: event.target.value })} placeholder="Tên tiếng Việt" className="w-full rounded border px-2 py-1 text-sm" />
            <input data-i18n-ignore required maxLength={100} value={dailyForm.nameJa} onChange={(event) => setDailyForm({ ...dailyForm, nameJa: event.target.value })} placeholder="日本語名" className="w-full rounded border px-2 py-1 text-sm" />
            <div className="flex items-center gap-2"><input type="color" value={dailyForm.color} onChange={(event) => setDailyForm({ ...dailyForm, color: event.target.value })} className="h-8 w-8 cursor-pointer rounded border" /><span className="text-xs text-gray-500">{dailyForm.color}</span></div>
            <div className="flex gap-2"><button data-i18n-ignore type="submit" className="rounded bg-blue-600 px-3 py-1 text-xs text-white">{editingDailyId ? (lang === "ja" ? "更新" : "Cập nhật") : (lang === "ja" ? "作成" : "Tạo")}</button><button data-i18n-ignore type="button" onClick={() => { setShowDailyForm(false); setEditingDailyId(null); }} className="rounded border px-3 py-1 text-xs">{lang === "ja" ? "キャンセル" : "Hủy"}</button></div>
          </form>}
          <div className="space-y-2">{dailyCategories.map((category: any) => <div key={category.id} className="flex items-center gap-3 rounded-lg bg-gray-50 p-3"><span className="h-4 w-4 shrink-0 rounded-full" style={{ backgroundColor: category.color }} /><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{lang === "ja" ? category.nameJa : category.nameVi}</p><p className="text-xs text-gray-500">{category.code} · {lang === "ja" ? category.nameVi : category.nameJa}</p></div><span className={`rounded-full px-2 py-0.5 text-xs ${category.isActive ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>{category.isActive ? "Active" : "Inactive"}</span><button data-i18n-ignore onClick={() => startDailyEdit(category)} className="text-xs text-blue-600 hover:underline">{lang === "ja" ? "編集" : "Sửa"}</button>{!category.isActive && <button data-i18n-ignore onClick={() => activateDailyCategory(category.id)} className="text-xs text-green-600 hover:underline">{lang === "ja" ? "有効化" : "Kích hoạt"}</button>}<button data-i18n-ignore onClick={() => deleteDailyCategory(category.id)} className="text-xs text-red-600 hover:underline">{lang === "ja" ? "削除" : "Xóa"}</button></div>)}</div>
        </div>

        {/* Test environment OS options */}
        <div className="rounded-lg border bg-white p-6">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 data-i18n-ignore className="text-lg font-semibold text-gray-900">{lang === "ja" ? "テスト環境OS" : "OS môi trường test"}</h3>
              <p data-i18n-ignore className="mt-1 text-xs text-gray-500">{lang === "ja" ? "テスト環境のOS選択肢を管理します。" : "Quản lý danh sách OS hiển thị trong ô chọn của môi trường test."}</p>
            </div>
            <button data-i18n-ignore onClick={() => { setShowOsForm(!showOsForm); setEditingOsId(null); setOsForm({ name: "", groupName: "Windows", sortOrder: "0", syncExisting: true }); }} className="text-sm text-blue-600 hover:underline">{lang === "ja" ? "+ 追加" : "+ Thêm"}</button>
          </div>
          {(showOsForm || editingOsId) && <form onSubmit={saveOsOption} className="mb-4 space-y-2 rounded bg-gray-50 p-3">
            <input data-i18n-ignore required maxLength={80} value={osForm.name} onChange={(event) => setOsForm({ ...osForm, name: event.target.value })} placeholder={lang === "ja" ? "OS名（例：Windows 11 Pro）" : "Tên OS (ví dụ: Windows 11 Pro)"} className="w-full rounded border px-2 py-1 text-sm" />
            <input data-i18n-ignore required maxLength={40} list="os-group-options" value={osForm.groupName} onChange={(event) => setOsForm({ ...osForm, groupName: event.target.value })} placeholder={lang === "ja" ? "グループ（例：Windows）" : "Nhóm (ví dụ: Windows)"} className="w-full rounded border px-2 py-1 text-sm" />
            <datalist id="os-group-options">
              {[...new Set(osOptions.map((option) => option.groupName))].map((groupName) => <option key={groupName} value={groupName} />)}
            </datalist>
            <label data-i18n-ignore className="flex items-center gap-2 text-xs text-gray-600">
              {lang === "ja" ? "表示順" : "Thứ tự hiển thị"}
              <input type="number" min={0} max={9999} value={osForm.sortOrder} onChange={(event) => setOsForm({ ...osForm, sortOrder: event.target.value })} className="w-24 rounded border px-2 py-1 text-sm" />
            </label>
            {editingOsId && <label data-i18n-ignore className="flex items-start gap-2 text-xs text-gray-600">
              <input type="checkbox" checked={osForm.syncExisting} onChange={(event) => setOsForm({ ...osForm, syncExisting: event.target.checked })} className="mt-0.5" />
              <span>{lang === "ja" ? "使用中データのOS名も同時に変更する" : "Đổi tên luôn cho các môi trường đang dùng tên cũ"}</span>
            </label>}
            <div className="flex gap-2">
              <button data-i18n-ignore type="submit" className="rounded bg-blue-600 px-3 py-1 text-xs text-white">{editingOsId ? (lang === "ja" ? "更新" : "Cập nhật") : (lang === "ja" ? "作成" : "Tạo")}</button>
              <button data-i18n-ignore type="button" onClick={() => { setShowOsForm(false); setEditingOsId(null); }} className="rounded border px-3 py-1 text-xs">{lang === "ja" ? "キャンセル" : "Hủy"}</button>
            </div>
          </form>}
          <div className="space-y-2">
            {osOptions.map((option) => (
              <div key={option.id} className="flex items-center gap-3 rounded-lg bg-gray-50 p-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{option.name}</p>
                  <p className="text-xs text-gray-500">{option.groupName} · #{option.sortOrder}</p>
                </div>
                <span className={`rounded-full px-2 py-0.5 text-xs ${option.isActive ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>{option.isActive ? "Active" : "Inactive"}</span>
                <button data-i18n-ignore onClick={() => startOsEdit(option)} className="text-xs text-blue-600 hover:underline">{lang === "ja" ? "編集" : "Sửa"}</button>
                {!option.isActive && <button data-i18n-ignore onClick={() => activateOsOption(option.id)} className="text-xs text-green-600 hover:underline">{lang === "ja" ? "有効化" : "Kích hoạt"}</button>}
                <button data-i18n-ignore onClick={() => deleteOsOption(option.id)} className="text-xs text-red-600 hover:underline">{lang === "ja" ? "削除" : "Xóa"}</button>
              </div>
            ))}
            {osOptions.length === 0 && <p data-i18n-ignore className="text-xs text-gray-500">{lang === "ja" ? "OS設定がありません。" : "Chưa có cấu hình OS."}</p>}
          </div>
        </div>

        {/* System Info */}
        <div className="bg-white rounded-lg border p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Thông tin hệ thống</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between py-2 border-b"><span className="text-gray-500">Phiên bản</span><span className="font-medium">1.0.0 MVP</span></div>
            <div className="flex justify-between py-2 border-b"><span className="text-gray-500">Timezone</span><span className="font-medium">Asia/Ho_Chi_Minh</span></div>
            <div className="flex justify-between py-2 border-b"><span className="text-gray-500">Sản phẩm</span><span className="font-medium">Zone / Gate / Hunter</span></div>
            <div className="flex justify-between py-2 border-b"><span className="text-gray-500">Vai trò của bạn</span><span className="font-medium">{user?.role}</span></div>
          </div>
        </div>

        {/* Audit logs */}
        <div className="rounded-lg border bg-white p-6">
          <div className="flex items-start gap-4">
            <div className="rounded-lg bg-blue-50 p-3 text-blue-600"><History className="h-6 w-6" /></div>
            <div className="flex-1">
              <h3 data-i18n-ignore className="text-lg font-semibold text-gray-900">{lang === "ja" ? "操作履歴" : "Lịch sử thao tác"}</h3>
              <p data-i18n-ignore className="mt-1 text-sm text-gray-500">{lang === "ja" ? "誰がいつどのデータを変更したか確認できます。" : "Kiểm tra ai đã thao tác gì, vào thời điểm nào và trên dữ liệu nào."}</p>
              <Link data-i18n-ignore href="/settings/audit-logs" className="mt-4 inline-flex rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
                {lang === "ja" ? "履歴を表示" : "Xem lịch sử"}
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
