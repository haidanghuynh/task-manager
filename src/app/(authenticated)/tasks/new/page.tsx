"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { hasPermission, type AppPermission } from "@/lib/permissions";
import { useRouter } from "next/navigation";
import { useLang } from "@/lib/i18n";
import { dailyWorkLabel } from "@/lib/task-work-type";
import { useDailyWorkCategories } from "@/lib/use-daily-work-categories";

export default function NewTaskPage() {
  const { data: session } = useSession();
  const user = session?.user as any;
  const router = useRouter();
  const { lang } = useLang();
  const dailyCategories = useDailyWorkCategories();
  const permissionUser = user as { role: "ADMIN" | "MANAGER" | "EMPLOYEE"; employeeId?: string | null; teamId?: string | null; permissions?: AppPermission[] } | undefined;
  const canCreateProduct = hasPermission(permissionUser, "TASK_CREATE");
  const canCreateDaily = hasPermission(permissionUser, "DAILY_TASK_CREATE");
  const canAssignTask = hasPermission(permissionUser, "TASK_ASSIGN");

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
    assigneeIds: [] as string[],
    plannedStartDate: "",
    plannedEndDate: "",
    plannedStartTime: "",
    plannedEndTime: "",
    status: "PLANNED",
    priority: "MEDIUM",
    note: "",
  });

  const effectiveWorkType = form.workType === "PRODUCT" && canCreateProduct
    ? "PRODUCT"
    : form.workType === "DAILY" && canCreateDaily
      ? "DAILY"
      : canCreateProduct ? "PRODUCT" : "DAILY";
  const selectedProduct = products.find((product) => product.id === form.productId);
  const selfEmployee = employees.find((employee) => employee.id === permissionUser?.employeeId);
  const effectiveAssigneeId = canAssignTask ? form.assigneeId : permissionUser?.employeeId || "";
  const canSelectMultipleDaily = effectiveWorkType === "DAILY"
    && (permissionUser?.role === "ADMIN" || (permissionUser?.role === "MANAGER" && canCreateDaily));
  const managerTeamId = permissionUser?.teamId || selfEmployee?.teamId;
  const dailyAssigneeOptions = employees.filter((employee) =>
    employee.isActive
    && (permissionUser?.role !== "MANAGER" || (!!managerTeamId && employee.teamId === managerTeamId)),
  );
  const taskCodePrefix = effectiveWorkType === "DAILY"
    ? "DAILY"
    : selectedProduct?.code || "PRODUCT";

  useEffect(() => {
    fetch("/api/products").then(r => r.json()).then(j => j.success && setProducts(j.data));
    fetch("/api/employees?pageSize=100").then(r => r.json()).then(j => j.success && setEmployees(j.data.employees));
  }, []);

  if (!canCreateProduct && !canCreateDaily) {
    return (
      <div className="p-6">
        <p className="p-4 bg-red-50 text-red-700 rounded-lg">Bạn không có quyền tạo task.</p>
      </div>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (canSelectMultipleDaily && !canAssignTask && form.assigneeIds.length === 0) {
      setError(lang === "ja" ? "チームメンバーを1人以上選択してください。" : "Vui lòng chọn ít nhất một thành viên trong nhóm.");
      return;
    }
    if (effectiveWorkType === "DAILY" && Boolean(form.plannedStartTime) !== Boolean(form.plannedEndTime)) {
      setError(lang === "ja" ? "開始時刻と終了時刻の両方を入力してください。" : "Vui lòng nhập đủ giờ bắt đầu và giờ kết thúc.");
      return;
    }
    if (
      effectiveWorkType === "DAILY"
      && form.plannedStartDate === (form.plannedEndDate || form.plannedStartDate)
      && form.plannedStartTime
      && form.plannedEndTime < form.plannedStartTime
    ) {
      setError(lang === "ja" ? "終了時刻は開始時刻より前にできません。" : "Giờ kết thúc không được trước giờ bắt đầu.");
      return;
    }
    setLoading(true);

    const res = await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        workType: effectiveWorkType,
        assigneeId: canSelectMultipleDaily ? "" : effectiveAssigneeId,
        assigneeIds: canSelectMultipleDaily ? form.assigneeIds : [],
        dailyCategory: effectiveWorkType === "DAILY" ? (form.dailyCategory === "__CUSTOM__" ? form.dailyCategoryCustom : form.dailyCategory) : null,
        plannedEndDate: form.plannedEndDate || null,
        plannedStartTime: effectiveWorkType === "DAILY" ? form.plannedStartTime || null : null,
        plannedEndTime: effectiveWorkType === "DAILY" ? form.plannedEndTime || null : null,
      }),
    });
    const json = await res.json();
    setLoading(false);

    if (json.success) {
      if (json.data.overlaps?.length > 0) {
        alert(`⚠️ Task bị trùng lịch với ${json.data.overlaps.length} task khác! Vẫn tạo thành công.`);
      }
      const createdTasks = json.data.tasks || [json.data.task];
      if (createdTasks.length > 1) {
        alert(lang === "ja"
          ? `${createdTasks.length}人分の連携タスクを作成しました。`
          : `Đã tạo công việc liên kết cho ${createdTasks.length} người.`);
        router.push("/tasks");
      } else {
        const hasAssignee = canSelectMultipleDaily ? form.assigneeIds.length > 0 : !!effectiveAssigneeId;
        router.push(hasAssignee ? `/tasks/${json.data.task.id}` : "/waiting-tasks");
      }
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
            <button type="button" disabled={!canCreateProduct} onClick={() => setForm({ ...form, workType: "PRODUCT", dailyCategory: "", assigneeIds: [], plannedStartTime: "", plannedEndTime: "" })}
              className={`rounded-md px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-40 ${effectiveWorkType === "PRODUCT" ? "bg-white font-medium text-blue-700 shadow-sm" : "text-gray-600"}`}>
              {lang === "ja" ? "製品タスク" : "Task sản phẩm"}
            </button>
            <button type="button" disabled={!canCreateDaily} onClick={() => setForm({ ...form, workType: "DAILY", productId: "", assigneeId: "" })}
              className={`rounded-md px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-40 ${effectiveWorkType === "DAILY" ? "bg-white font-medium text-purple-700 shadow-sm" : "text-gray-600"}`}>
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
            {effectiveWorkType === "PRODUCT" ? (
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
                  {dailyCategories.filter((category) => category.isActive !== false).map((category) => <option key={category.code} value={category.code}>{dailyWorkLabel(category.code, lang, dailyCategories)}</option>)}
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
            {canSelectMultipleDaily ? (
              <div className="rounded-lg border bg-white">
                <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
                  <span className="text-xs text-gray-500">
                    {lang === "ja" ? `${form.assigneeIds.length}人選択` : `Đã chọn ${form.assigneeIds.length} người`}
                  </span>
                  <div className="flex gap-2 text-xs">
                    <button
                      type="button"
                      onClick={() => setForm({ ...form, assigneeIds: dailyAssigneeOptions.map((employee) => employee.id) })}
                      className="text-blue-600 hover:underline"
                    >
                      {lang === "ja" ? "すべて選択" : "Chọn tất cả"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setForm({ ...form, assigneeIds: [] })}
                      className="text-gray-500 hover:underline"
                    >
                      {lang === "ja" ? "選択解除" : "Bỏ chọn"}
                    </button>
                  </div>
                </div>
                <div className="max-h-52 space-y-1 overflow-y-auto p-2">
                  {dailyAssigneeOptions.map((employee) => (
                    <label key={employee.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-gray-50">
                      <input
                        type="checkbox"
                        checked={form.assigneeIds.includes(employee.id)}
                        onChange={(event) => setForm({
                          ...form,
                          assigneeIds: event.target.checked
                            ? [...form.assigneeIds, employee.id]
                            : form.assigneeIds.filter((id) => id !== employee.id),
                        })}
                      />
                      <span>{employee.fullName} ({employee.employeeCode})</span>
                    </label>
                  ))}
                  {dailyAssigneeOptions.length === 0 && (
                    <p className="px-2 py-3 text-sm text-amber-700">
                      {permissionUser?.role === "MANAGER"
                        ? (lang === "ja" ? "所属チームに有効なメンバーがいません。" : "Không có thành viên active trong nhóm của quản trị viên.")
                        : (lang === "ja" ? "有効な従業員がいません。" : "Không có nhân viên active.")}
                    </p>
                  )}
                </div>
              </div>
            ) : canAssignTask ? (
              <select value={form.assigneeId} onChange={e => setForm({...form, assigneeId: e.target.value})}
                className="w-full border rounded px-3 py-2 text-sm">
                <option value="">{lang === "ja" ? "未割り当てのまま受け付ける" : "Để trống — chờ phân công"}</option>
                {employees.filter((e: any) => e.isActive).map((e: any) => <option key={e.id} value={e.id}>{e.fullName} ({e.employeeCode})</option>)}
              </select>
            ) : (
              <div className="rounded border bg-gray-50 px-3 py-2 text-sm text-gray-700">
                {selfEmployee ? `${selfEmployee.fullName} (${selfEmployee.employeeCode})` : (lang === "ja" ? "自分に割り当て" : "Phân công cho chính mình")}
              </div>
            )}
          </div>
        </div>

        {(canAssignTask || canSelectMultipleDaily) && (canSelectMultipleDaily ? form.assigneeIds.length === 0 : !form.assigneeId) && (
          <p className="rounded bg-amber-50 p-3 text-sm text-amber-700">
            {canSelectMultipleDaily && !canAssignTask
              ? (lang === "ja" ? "チームメンバーを1人以上選択してください。" : "Vui lòng chọn ít nhất một thành viên trong nhóm.")
              : (lang === "ja" ? "このタスクは未割り当てタスク一覧に保存され、後で担当者を割り当てます。" : "Task sẽ được lưu vào danh sách chờ và phân công sau.")}
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

        {effectiveWorkType === "DAILY" && (
          <div className="grid grid-cols-2 gap-4 rounded-lg border p-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {lang === "ja" ? "開始時刻（任意）" : "Giờ bắt đầu (không bắt buộc)"}
              </label>
              <input
                type="time"
                value={form.plannedStartTime}
                onChange={(event) => setForm({ ...form, plannedStartTime: event.target.value })}
                className="w-full rounded border px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {lang === "ja" ? "終了時刻（任意）" : "Giờ kết thúc (không bắt buộc)"}
              </label>
              <input
                type="time"
                value={form.plannedEndTime}
                onChange={(event) => setForm({ ...form, plannedEndTime: event.target.value })}
                className="w-full rounded border px-3 py-2 text-sm"
              />
            </div>
            <p className="col-span-2 text-xs text-gray-500">
              {lang === "ja" ? "時刻を設定する場合は、開始と終了の両方を入力してください。" : "Nếu chọn thời gian, cần nhập đủ cả giờ bắt đầu và giờ kết thúc."}
            </p>
          </div>
        )}

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
