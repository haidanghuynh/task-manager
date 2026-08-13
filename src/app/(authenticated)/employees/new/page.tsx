"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { hasPermission, type AppPermission } from "@/lib/permissions";
import { useRouter } from "next/navigation";

export default function NewEmployeePage() {
  const { data: session } = useSession();
  const user = session?.user as any;
  const router = useRouter();
  const [teams, setTeams] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    employeeCode: "", fullName: "", email: "", department: "", position: "", teamId: ""
  });

  const isManager = hasPermission(user as { role: "ADMIN" | "MANAGER" | "EMPLOYEE"; permissions?: AppPermission[] } | undefined, "EMPLOYEE_MANAGE");

  useEffect(() => {
    fetch("/api/teams").then(r => r.json()).then(j => j.success && setTeams(j.data));
  }, []);

  if (!isManager) {
    return <div className="p-6"><p className="p-4 bg-red-50 text-red-700 rounded-lg">Bạn không có quyền thêm nhân viên.</p></div>;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const res = await fetch("/api/employees", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const json = await res.json();
    setLoading(false);
    if (json.success) {
      setForm({ employeeCode: "", fullName: "", email: "", department: "", position: "", teamId: "" });
      alert("✅ Đã thêm nhân viên thành công!");
      router.push(`/employees/${json.data.id}`);
    } else {
      if (json.error?.code === "DUPLICATE") {
        setError("Mã nhân viên hoặc email đã tồn tại. Vui lòng dùng mã khác.");
      } else {
        setError(json.error?.message || "Có lỗi xảy ra");
      }
    }
  }

  return (
    <div className="p-6 max-w-2xl">
      <h2 className="text-2xl font-bold text-gray-900 mb-6">Thêm nhân viên mới</h2>
      <form onSubmit={handleSubmit} className="space-y-4 bg-white p-6 rounded-lg border">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Mã nhân viên *</label>
            <input required value={form.employeeCode} onChange={e => setForm({...form, employeeCode: e.target.value})}
              className="w-full border rounded px-3 py-2 text-sm" placeholder="NV011" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Họ và tên *</label>
            <input required value={form.fullName} onChange={e => setForm({...form, fullName: e.target.value})}
              className="w-full border rounded px-3 py-2 text-sm" placeholder="Nguyễn Văn A" />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
          <input type="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})}
            className="w-full border rounded px-3 py-2 text-sm" placeholder="email@example.com" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Bộ phận</label>
            <input value={form.department} onChange={e => setForm({...form, department: e.target.value})}
              className="w-full border rounded px-3 py-2 text-sm" placeholder="Phát triển" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Chức vụ</label>
            <input value={form.position} onChange={e => setForm({...form, position: e.target.value})}
              className="w-full border rounded px-3 py-2 text-sm" placeholder="Dev" />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Nhóm</label>
          <select value={form.teamId} onChange={e => setForm({...form, teamId: e.target.value})}
            className="w-full border rounded px-3 py-2 text-sm">
            <option value="">Không có nhóm</option>
            {teams.map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        {error && <div className="p-3 bg-red-50 text-red-700 rounded text-sm">{error}</div>}
        <div className="flex gap-3 pt-2">
          <button type="submit" disabled={loading} className="px-6 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50">
            {loading ? "Đang tạo..." : "Thêm nhân viên"}
          </button>
          <button type="button" onClick={() => router.back()} className="px-6 py-2 border rounded-lg text-sm hover:bg-gray-50">Hủy</button>
        </div>
      </form>
    </div>
  );
}
