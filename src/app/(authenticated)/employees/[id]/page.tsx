"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { formatDate } from "@/lib/date";

export default function EmployeeDetailPage() {
  const { data: session } = useSession();
  const user = session?.user as any;
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [emp, setEmp] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<any>({});
  const [teams, setTeams] = useState<any[]>([]);

  const isManager = user?.role === "ADMIN" || user?.role === "MANAGER";
  const isAdmin = user?.role === "ADMIN";

  useEffect(() => { fetchEmp(); fetch("/api/teams").then(r => r.json()).then(j => j.success && setTeams(j.data)); }, [id]);

  async function fetchEmp() {
    setLoading(true);
    const r = await fetch(`/api/employees/${id}`);
    const j = await r.json();
    if (j.success) { setEmp(j.data); setEditForm(j.data); }
    setLoading(false);
  }

  async function handleSave() {
    await fetch(`/api/employees/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editForm),
    });
    setEditing(false);
    fetchEmp();
  }

  async function handleDelete() {
    if (!confirm("Xóa vĩnh viễn nhân viên này và tài khoản đăng nhập liên kết? Thao tác này không thể hoàn tác.")) return;
    const response = await fetch(`/api/employees/${id}`, { method: "DELETE" });
    if (!response.ok) { alert("Không thể xóa nhân viên."); return; }
    router.push("/employees");
    router.refresh();
  }

  if (loading) return <div className="p-6 text-center text-gray-500">Đang tải...</div>;
  if (!emp) return <div className="p-6 text-center text-red-500">Không tìm thấy nhân viên</div>;

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <button onClick={() => router.back()} className="text-sm text-gray-500 hover:text-gray-700">← Quay lại</button>
          <h2 className="text-2xl font-bold text-gray-900 mt-1">{emp.fullName}</h2>
          <p className="text-sm text-gray-500 font-mono">{emp.employeeCode}</p>
        </div>
        <div className="flex gap-2">
          {isManager && !editing && (
            <>
              <button onClick={() => setEditing(true)} className="px-3 py-1.5 border rounded text-sm hover:bg-gray-50">Chỉnh sửa</button>
              {isAdmin && <button onClick={handleDelete} className="px-3 py-1.5 border border-red-200 rounded text-sm text-red-600 hover:bg-red-50">Xóa</button>}
            </>
          )}
        </div>
      </div>

      {editing ? (
        <div className="bg-white p-6 rounded-lg border space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div><label className="text-xs text-gray-500">Họ và tên</label><input value={editForm.fullName} onChange={e => setEditForm({...editForm, fullName: e.target.value})} className="w-full border rounded px-3 py-1.5 text-sm mt-1" /></div>
            <div><label className="text-xs text-gray-500">Email</label><input value={editForm.email || ""} onChange={e => setEditForm({...editForm, email: e.target.value})} className="w-full border rounded px-3 py-1.5 text-sm mt-1" /></div>
            <div><label className="text-xs text-gray-500">Bộ phận</label><input value={editForm.department || ""} onChange={e => setEditForm({...editForm, department: e.target.value})} className="w-full border rounded px-3 py-1.5 text-sm mt-1" /></div>
            <div><label className="text-xs text-gray-500">Chức vụ</label><input value={editForm.position || ""} onChange={e => setEditForm({...editForm, position: e.target.value})} className="w-full border rounded px-3 py-1.5 text-sm mt-1" /></div>
            <div><label className="text-xs text-gray-500">Nhóm</label><select value={editForm.teamId || ""} onChange={e => setEditForm({...editForm, teamId: e.target.value || null})} className="w-full border rounded px-3 py-1.5 text-sm mt-1">
              <option value="">Không có nhóm</option>
              {teams.map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select></div>
          </div>
          <div className="flex gap-2">
            <button onClick={handleSave} className="px-4 py-1.5 bg-blue-600 text-white rounded text-sm">Lưu</button>
            <button onClick={() => setEditing(false)} className="px-4 py-1.5 border rounded text-sm">Hủy</button>
          </div>
        </div>
      ) : (
        <div className="bg-white p-6 rounded-lg border grid grid-cols-1 md:grid-cols-2 gap-4">
          <div><label className="text-xs text-gray-500">Email</label><p className="font-medium">{emp.email || "—"}</p></div>
          <div><label className="text-xs text-gray-500">Bộ phận</label><p className="font-medium">{emp.department || "—"}</p></div>
          <div><label className="text-xs text-gray-500">Chức vụ</label><p className="font-medium">{emp.position || "—"}</p></div>
          <div><label className="text-xs text-gray-500">Nhóm</label><p className="font-medium">{emp.team?.name || "—"}</p></div>
          <div><label className="text-xs text-gray-500">Trạng thái</label><span className={`px-2 py-0.5 rounded-full text-xs ${emp.isActive ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>{emp.isActive ? "Đang hoạt động" : "Ngừng hoạt động"}</span></div>
          <div><label className="text-xs text-gray-500">Ngày tạo</label><p className="text-sm">{formatDate(emp.createdAt)}</p></div>
        </div>
      )}

      {/* Tasks */}
      <div className="bg-white p-6 rounded-lg border">
        <h3 className="font-semibold text-gray-900 mb-3">Task gần đây ({emp.tasks?.length || 0})</h3>
        {emp.tasks?.length === 0 && <p className="text-sm text-gray-400">Chưa có task</p>}
        {emp.tasks?.map((t: any) => (
          <div key={t.id} className="py-2 border-b last:border-0">
            <a href={`/tasks/${t.id}`} className="text-sm text-blue-600 hover:underline">{t.taskCode}: {t.taskName}</a>
            <span className="text-xs text-gray-400 ml-2">{t.product?.name}</span>
            <span className="text-xs text-gray-400 ml-2">{t.status}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
