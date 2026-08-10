"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

export default function NewTaskPage() {
  const { data: session } = useSession();
  const user = session?.user as any;
  const router = useRouter();

  const [products, setProducts] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [form, setForm] = useState({
    taskName: "",
    description: "",
    productId: "",
    assigneeId: "",
    plannedStartDate: "",
    plannedEndDate: "",
    status: "PLANNED",
    priority: "MEDIUM",
    note: "",
  });

  useEffect(() => {
    fetch("/api/products").then(r => r.json()).then(j => j.success && setProducts(j.data));
    fetch("/api/employees").then(r => r.json()).then(j => j.success && setEmployees(j.data.employees));
  }, []);

  if (user?.role !== "ADMIN" && user?.role !== "MANAGER") {
    return (
      <div className="p-6">
        <p className="p-4 bg-red-50 text-red-700 rounded-lg">Bạn không có quyền tạo task.</p>
      </div>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const res = await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const json = await res.json();
    setLoading(false);

    if (json.success) {
      if (json.data.overlaps?.length > 0) {
        alert(`⚠️ Task bị trùng lịch với ${json.data.overlaps.length} task khác! Vẫn tạo thành công.`);
      }
      router.push(`/tasks/${json.data.task.id}`);
    } else {
      setError(json.error?.message || "Có lỗi xảy ra");
    }
  }

  return (
    <div className="p-6 max-w-2xl">
      <h2 className="text-2xl font-bold text-gray-900 mb-6">Tạo task mới</h2>

      <form onSubmit={handleSubmit} className="space-y-4 bg-white p-6 rounded-lg border">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Tên task *</label>
          <input type="text" required value={form.taskName} onChange={e => setForm({...form, taskName: e.target.value})}
            className="w-full border rounded px-3 py-2 text-sm" placeholder="Nhập tên task..." />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Mô tả</label>
          <textarea value={form.description} onChange={e => setForm({...form, description: e.target.value})}
            className="w-full border rounded px-3 py-2 text-sm" rows={3} placeholder="Mô tả chi tiết..." />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Sản phẩm *</label>
            <select required value={form.productId} onChange={e => setForm({...form, productId: e.target.value})}
              className="w-full border rounded px-3 py-2 text-sm">
              <option value="">Chọn sản phẩm...</option>
              {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Người phụ trách *</label>
            <select required value={form.assigneeId} onChange={e => setForm({...form, assigneeId: e.target.value})}
              className="w-full border rounded px-3 py-2 text-sm">
              <option value="">Chọn nhân viên...</option>
              {employees.filter((e: any) => e.isActive).map((e: any) => <option key={e.id} value={e.id}>{e.fullName} ({e.employeeCode})</option>)}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Ngày bắt đầu *</label>
            <input type="date" required value={form.plannedStartDate} onChange={e => setForm({...form, plannedStartDate: e.target.value})}
              className="w-full border rounded px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Ngày kết thúc</label>
            <input type="date" value={form.plannedEndDate} onChange={e => setForm({...form, plannedEndDate: e.target.value})}
              className="w-full border rounded px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Trạng thái</label>
            <select value={form.status} onChange={e => setForm({...form, status: e.target.value})}
              className="w-full border rounded px-3 py-2 text-sm">
              <option value="PLANNED">Chưa bắt đầu</option>
              <option value="IN_PROGRESS">Đang thực hiện</option>
              <option value="WAITING">Đang chờ</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Độ ưu tiên</label>
          <select value={form.priority} onChange={e => setForm({...form, priority: e.target.value})}
            className="w-full border rounded px-3 py-2 text-sm">
            <option value="LOW">Thấp</option>
            <option value="MEDIUM">Trung bình</option>
            <option value="HIGH">Cao</option>
            <option value="URGENT">Khẩn cấp</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Ghi chú</label>
          <input type="text" value={form.note} onChange={e => setForm({...form, note: e.target.value})}
            className="w-full border rounded px-3 py-2 text-sm" placeholder="Ghi chú thêm..." />
        </div>

        {error && <div className="p-3 bg-red-50 text-red-700 rounded text-sm">{error}</div>}

        <div className="flex gap-3 pt-2">
          <button type="submit" disabled={loading}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50">
            {loading ? "Đang tạo..." : "Tạo task"}
          </button>
          <button type="button" onClick={() => router.back()}
            className="px-6 py-2 border rounded-lg text-sm hover:bg-gray-50">
            Hủy
          </button>
        </div>
      </form>
    </div>
  );
}