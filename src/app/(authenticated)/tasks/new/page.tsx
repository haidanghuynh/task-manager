"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { hasPermission, type AppPermission } from "@/lib/permissions";
import { useRouter } from "next/navigation";
import { useLang } from "@/lib/i18n";
import { DAILY_WORK_CATEGORIES, dailyWorkLabel } from "@/lib/task-work-type";

export default function NewTaskPage() {
  const { data: session } = useSession();
  const user = session?.user as any;
  const router = useRouter();
  const { lang } = useLang();

  const [products, setProducts] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [form, setForm] = useState({
    taskName: "",
    description: "",
    workType: "PRODUCT",
    dailyCategory: "",
    dailyCategoryCustom: "",
    productId: "",
    taskNumber: "",
    assigneeId: "",
    plannedStartDate: "",
    plannedEndDate: "",
    status: "PLANNED",
    priority: "MEDIUM",
    note: "",
  });

  const selectedProduct = products.find((product) => product.id === form.productId);
  const taskCodePrefix = form.workType === "DAILY"
    ? "DAILY"
    : selectedProduct?.code || "PRODUCT";

  useEffect(() => {
    fetch("/api/products").then(r => r.json()).then(j => j.success && setProducts(j.data));
    fetch("/api/employees").then(r => r.json()).then(j => j.success && setEmployees(j.data.employees));
  }, []);

  if (!hasPermission(user as { role: "ADMIN" | "MANAGER" | "EMPLOYEE"; permissions?: AppPermission[] } | undefined, "TASK_CREATE")) {
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
      body: JSON.stringify({
        ...form,
        dailyCategory: form.workType === "DAILY" ? (form.dailyCategory === "__CUSTOM__" ? form.dailyCategoryCustom : form.dailyCategory) : null,
        plannedEndDate: form.plannedEndDate || null,
      }),
    });
    const json = await res.json();
    setLoading(false);

    if (json.success) {
      if (json.data.overlaps?.length > 0) {
        alert(`⚠️ Task bị trùng lịch với ${json.data.overlaps.length} task khác! Vẫn tạo thành công.`);
      }
      router.push(form.assigneeId ? `/tasks/${json.data.task.id}` : "/waiting-tasks");
    } else {
      setError(
        json.error?.code === "TASK_CODE_EXISTS" && lang === "ja"
          ? "タスクコードは既に存在します。別の末尾コードを入力してください。空欄の場合は末尾を追加してください。"
          : json.error?.message || (lang === "ja" ? "エラーが発生しました" : "Có lỗi xảy ra"),
      );
    }
  }

  return (
    <div className="p-6 max-w-2xl">
      <h2 className="text-2xl font-bold text-gray-900 mb-6">Tạo task mới</h2>

      <form onSubmit={handleSubmit} className="space-y-4 bg-white p-6 rounded-lg border">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {lang === "ja" ? "業務タイプ *" : "Loại công việc *"}
          </label>
          <div className="grid grid-cols-2 gap-2 rounded-lg bg-gray-100 p-1">
            <button type="button" onClick={() => setForm({ ...form, workType: "PRODUCT", dailyCategory: "" })}
              className={`rounded-md px-3 py-2 text-sm ${form.workType === "PRODUCT" ? "bg-white font-medium text-blue-700 shadow-sm" : "text-gray-600"}`}>
              {lang === "ja" ? "製品タスク" : "Task sản phẩm"}
            </button>
            <button type="button" onClick={() => setForm({ ...form, workType: "DAILY", productId: "" })}
              className={`rounded-md px-3 py-2 text-sm ${form.workType === "DAILY" ? "bg-white font-medium text-purple-700 shadow-sm" : "text-gray-600"}`}>
              {lang === "ja" ? "日常業務" : "Công việc hằng ngày"}
            </button>
          </div>
        </div>
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
            {form.workType === "PRODUCT" ? (
              <>
                <label className="block text-sm font-medium text-gray-700 mb-1">{lang === "ja" ? "製品 *" : "Sản phẩm *"}</label>
                <select required value={form.productId} onChange={e => setForm({...form, productId: e.target.value})}
                  className="w-full border rounded px-3 py-2 text-sm">
                  <option value="">{lang === "ja" ? "製品を選択..." : "Chọn sản phẩm..."}</option>
                  {products.filter((p) => p.isActive).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </>
            ) : (
              <>
                <label className="block text-sm font-medium text-gray-700 mb-1">{lang === "ja" ? "業務カテゴリ *" : "Nhóm công việc *"}</label>
                <select required value={form.dailyCategory} onChange={e => setForm({...form, dailyCategory: e.target.value})}
                  className="w-full border rounded px-3 py-2 text-sm">
                  <option value="">{lang === "ja" ? "カテゴリを選択..." : "Chọn nhóm công việc..."}</option>
                  {DAILY_WORK_CATEGORIES.filter((category) => category !== "OTHER").map((category) => <option key={category} value={category}>{dailyWorkLabel(category, lang)}</option>)}
                  <option value="__CUSTOM__">{lang === "ja" ? "その他（入力）" : "Khác (tự nhập)"}</option>
                </select>
                {form.dailyCategory === "__CUSTOM__" && <input required maxLength={100} value={form.dailyCategoryCustom} onChange={(e) => setForm({ ...form, dailyCategoryCustom: e.target.value })} className="mt-2 w-full rounded border px-3 py-2 text-sm" placeholder={lang === "ja" ? "業務カテゴリを入力..." : "Nhập nhóm công việc..."} />}
              </>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {lang === "ja" ? "担当者（任意）" : "Người phụ trách (không bắt buộc)"}
            </label>
            <select value={form.assigneeId} onChange={e => setForm({...form, assigneeId: e.target.value})}
              className="w-full border rounded px-3 py-2 text-sm">
              <option value="">{lang === "ja" ? "未割り当てのまま受け付ける" : "Để trống — chờ phân công"}</option>
              {employees.filter((e: any) => e.isActive).map((e: any) => <option key={e.id} value={e.id}>{e.fullName} ({e.employeeCode})</option>)}
            </select>
          </div>
        </div>

        {!form.assigneeId && (
          <p className="rounded bg-amber-50 p-3 text-sm text-amber-700">
            {lang === "ja" ? "このタスクは未割り当てタスク一覧に保存され、後で担当者を割り当てます。" : "Task sẽ được lưu vào danh sách chờ và phân công sau."}
          </p>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {lang === "ja" ? "タスクコードの末尾（任意）" : "Phần sau mã task (không bắt buộc)"}
          </label>
          <div className="flex rounded border bg-white focus-within:ring-2 focus-within:ring-blue-500">
            <span className="flex items-center border-r bg-gray-50 px-3 text-sm text-gray-600">
              {taskCodePrefix}-
            </span>
            <input
              type="text"
              maxLength={40}
              pattern="[A-Za-z0-9]+([._-][A-Za-z0-9]+)*"
              title={lang === "ja" ? "英数字、ピリオド、アンダースコア、ハイフンを使用できます" : "Có thể dùng chữ, số, dấu chấm, gạch dưới và gạch ngang"}
              value={form.taskNumber}
              onChange={(e) => setForm({ ...form, taskNumber: e.target.value })}
              className="min-w-0 flex-1 rounded-r px-3 py-2 text-sm outline-none"
              placeholder={lang === "ja" ? "例：2.22.4" : "Ví dụ: 2.22.4"}
              aria-label={lang === "ja" ? "タスクコードの末尾" : "Phần sau mã task"}
            />
          </div>
          <p className="mt-1 text-xs text-gray-500">
            {lang === "ja" ? "コード：" : "Mã sẽ là "}
            {form.taskNumber ? `${taskCodePrefix}-${form.taskNumber}` : taskCodePrefix}.
            {lang === "ja"
              ? " 末尾コードが不要な場合は空欄にしてください。同じタスクコードも使用できます。"
              : " Để trống nếu không cần phần mã phía sau; mã task có thể trùng."}
          </p>
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
