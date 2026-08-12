"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useLang } from "@/lib/i18n";

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

  useEffect(() => { fetchProducts(); }, []);

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
      </div>
    </div>
  );
}
