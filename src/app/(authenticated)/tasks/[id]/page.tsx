"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { STATUS_LABELS, PRIORITY_LABELS, STATUS_COLORS, PRIORITY_COLORS } from "@/types";
import { formatDate } from "@/lib/date";
import { hasPermission, type AppPermission } from "@/lib/permissions";
import type { TaskStatus, TaskPriority } from "@/types";
import { useLang } from "@/lib/i18n";
import { dailyWorkColor, dailyWorkLabel } from "@/lib/task-work-type";
import { useDailyWorkCategories } from "@/lib/use-daily-work-categories";

export default function TaskDetailPage() {
  const { data: session } = useSession();
  const { lang } = useLang();
  const dailyCategories = useDailyWorkCategories();
  const user = session?.user as any;
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [task, setTask] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [newComment, setNewComment] = useState("");
  const [editing, setEditing] = useState(false);
  const [editData, setEditData] = useState<any>({});
  const [employees, setEmployees] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [error, setError] = useState("");
  const [unassignReason, setUnassignReason] = useState("");
  const [unassigning, setUnassigning] = useState(false);

  useEffect(() => {
    fetchTask();
    fetch("/api/employees?pageSize=100")
      .then((response) => response.json())
      .then((json) => json.success && setEmployees(json.data.employees));
    fetch("/api/products")
      .then((response) => response.json())
      .then((json) => json.success && setProducts(json.data));
  }, [id]);

  async function fetchTask() {
    setLoading(true);
    const res = await fetch(`/api/tasks/${id}`);
    const json = await res.json();
    if (json.success) { setTask(json.data); setEditData(json.data); }
    setLoading(false);
  }

  async function handleStatusUpdate(newStatus: string) {
    await fetch(`/api/tasks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    fetchTask();
  }

  async function handleProgressUpdate(progress: number) {
    await fetch(`/api/tasks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ progress }),
    });
    fetchTask();
  }

  async function handleSave() {
    setError("");
    const response = await fetch(`/api/tasks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editData),
    });
    const json = await response.json();
    if (!json.success) {
      setError(json.error?.message || "Không thể cập nhật task");
      return;
    }
    setEditing(false);
    fetchTask();
  }

  async function handleComment() {
    if (!newComment.trim()) return;
    await fetch(`/api/tasks/${id}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: newComment }),
    });
    setNewComment("");
    fetchTask();
  }

  async function handleReassign(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setError("");
    const response = await fetch(`/api/tasks/${id}/reassign`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ employeeId: form.get("employeeId"), reason: String(form.get("reason") || "") }),
    });
    const json = await response.json();
    if (!json.success) {
      setError(json.error?.message || "Không thể chuyển task");
      return;
    }
    e.currentTarget.reset();
    fetchTask();
  }

  async function handleDelete() {
    if (!confirm("Bạn có chắc muốn xóa task này?")) return;
    await fetch(`/api/tasks/${id}`, { method: "DELETE" });
    router.push("/tasks");
  }

  async function handleUnassign(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const confirmed = confirm(lang === "ja"
      ? "このタスクを未割り当て一覧へ戻しますか？"
      : "Thu hồi task này về danh sách chờ phân công?");
    if (!confirmed) return;

    setError("");
    setUnassigning(true);
    const response = await fetch(`/api/tasks/${id}/unassign`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: unassignReason }),
    });
    const json = await response.json();
    setUnassigning(false);
    if (!json.success) {
      setError(json.error?.code === "INVALID_STATE"
        ? (lang === "ja" ? "完了またはキャンセル済みのタスクは未割り当てに戻せません。" : "Task hoàn thành hoặc đã hủy không thể thu hồi về hàng chờ.")
        : json.error?.message || (lang === "ja" ? "タスクを未割り当てに戻せません。" : "Không thể thu hồi task về hàng chờ."));
      return;
    }
    router.push("/waiting-tasks");
  }

  const permissionUser = user as { role: "ADMIN" | "MANAGER" | "EMPLOYEE"; permissions?: AppPermission[] } | undefined;
  const canEdit = hasPermission(permissionUser, "TASK_EDIT");
  const canDelete = hasPermission(permissionUser, "TASK_DELETE");
  const canAssign = hasPermission(permissionUser, "TASK_ASSIGN");
  const isAssignee = task && user?.employeeId === task.currentAssigneeId;
  const canUpdateOwn = isAssignee && hasPermission(permissionUser, "TASK_UPDATE_OWN");
  const isTerminalTask = task?.status === "COMPLETED" || task?.status === "CANCELLED";

  if (loading) return <div className="p-6 text-center text-gray-500">Đang tải...</div>;
  if (!task) return <div className="p-6 text-center text-red-500">Không tìm thấy task</div>;

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <button onClick={() => router.back()} className="text-sm text-gray-500 hover:text-gray-700">← Quay lại</button>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mt-1">{task.taskName}</h2>
          <p className="text-sm text-gray-500 font-mono mt-0.5">{task.taskCode}</p>
        </div>
        <div className="flex gap-2">
          {(canEdit || canDelete) && (
            <>
              {canEdit && !editing && <button onClick={() => setEditing(true)} className="px-3 py-1.5 border rounded text-sm hover:bg-gray-50">Chỉnh sửa</button>}
              {canDelete && <button onClick={handleDelete} className="px-3 py-1.5 border border-red-200 text-red-600 rounded text-sm hover:bg-red-50">Xóa</button>}
            </>
          )}
        </div>
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      {editing && (
        <div className="space-y-4 rounded-lg border bg-white p-6">
          <h3 className="font-semibold text-gray-900">Chỉnh sửa task</h3>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <label className="text-sm">{lang === "ja" ? "業務タイプ" : "Loại công việc"}
              <select
                value={editData.workType || "PRODUCT"}
                onChange={(e) => setEditData({
                  ...editData,
                  workType: e.target.value,
                  productId: e.target.value === "DAILY" ? null : editData.productId,
                  dailyCategory: e.target.value === "PRODUCT" ? null : editData.dailyCategory,
                })}
                className="mt-1 w-full rounded border px-3 py-2"
              >
                <option value="PRODUCT">{lang === "ja" ? "製品タスク" : "Task sản phẩm"}</option>
                <option value="DAILY">{lang === "ja" ? "日常業務" : "Công việc hằng ngày"}</option>
              </select>
            </label>
            {editData.workType === "DAILY" ? (
              <label className="text-sm">{lang === "ja" ? "業務カテゴリ" : "Nhóm công việc"}
                <select value={dailyCategories.some((category) => category.code === editData.dailyCategory) ? editData.dailyCategory : "__CUSTOM__"} onChange={(e) => setEditData({ ...editData, dailyCategory: e.target.value === "__CUSTOM__" ? "" : e.target.value })} className="mt-1 w-full rounded border px-3 py-2" required>
                  <option value="">{lang === "ja" ? "カテゴリを選択..." : "Chọn nhóm công việc..."}</option>
                  {dailyCategories.filter((category) => category.isActive !== false || category.code === editData.dailyCategory).map((category) => <option key={category.code} value={category.code}>{dailyWorkLabel(category.code, lang, dailyCategories)}</option>)}
                  <option value="__CUSTOM__">{lang === "ja" ? "その他（入力）" : "Khác (tự nhập)"}</option>
                </select>
                {!dailyCategories.some((category) => category.code === editData.dailyCategory) && <input required maxLength={100} value={editData.dailyCategory === "OTHER" ? "" : editData.dailyCategory || ""} onChange={(e) => setEditData({ ...editData, dailyCategory: e.target.value })} className="mt-2 w-full rounded border px-3 py-2" placeholder={lang === "ja" ? "業務カテゴリを入力..." : "Nhập nhóm công việc..."} />}
              </label>
            ) : (
              <label className="text-sm">{lang === "ja" ? "製品" : "Sản phẩm"}
                <select value={editData.productId || ""} onChange={(e) => setEditData({ ...editData, productId: e.target.value })} className="mt-1 w-full rounded border px-3 py-2" required>
                  <option value="">{lang === "ja" ? "製品を選択..." : "Chọn sản phẩm..."}</option>
                  {products.filter((product) => product.isActive || product.id === task.productId).map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
                </select>
              </label>
            )}
            <label className="text-sm md:col-span-2">Mã task
              <input
                value={editData.taskCode || ""}
                onChange={(e) => setEditData({ ...editData, taskCode: e.target.value })}
                maxLength={100}
                pattern="[A-Za-z0-9._-]+"
                title="Có thể dùng chữ, số, dấu chấm, gạch dưới và gạch ngang"
                className="mt-1 w-full rounded border px-3 py-2 font-mono"
                placeholder="Ví dụ: ZONE-2.20.2"
                required
              />
            </label>
            <label className="text-sm md:col-span-2">Tên task
              <input value={editData.taskName || ""} onChange={(e) => setEditData({ ...editData, taskName: e.target.value })} className="mt-1 w-full rounded border px-3 py-2" />
            </label>
            <label className="text-sm">Bắt đầu dự kiến
              <input type="date" value={editData.plannedStartDate?.slice(0, 10) || ""} onChange={(e) => setEditData({ ...editData, plannedStartDate: e.target.value })} className="mt-1 w-full rounded border px-3 py-2" />
            </label>
            <label className="text-sm">Kết thúc dự kiến
              <input type="date" value={editData.plannedEndDate?.slice(0, 10) || ""} onChange={(e) => setEditData({ ...editData, plannedEndDate: e.target.value })} className="mt-1 w-full rounded border px-3 py-2" />
            </label>
            <label className="text-sm">Độ ưu tiên
              <select value={editData.priority || "MEDIUM"} onChange={(e) => setEditData({ ...editData, priority: e.target.value })} className="mt-1 w-full rounded border px-3 py-2">
                <option value="LOW">Thấp</option><option value="MEDIUM">Trung bình</option><option value="HIGH">Cao</option><option value="URGENT">Khẩn cấp</option>
              </select>
            </label>
            <label className="text-sm md:col-span-2">Mô tả
              <textarea value={editData.description || ""} onChange={(e) => setEditData({ ...editData, description: e.target.value })} className="mt-1 min-h-24 w-full rounded border px-3 py-2" />
            </label>
            <label className="text-sm md:col-span-2">Ghi chú
              <textarea value={editData.note || ""} onChange={(e) => setEditData({ ...editData, note: e.target.value })} className="mt-1 min-h-20 w-full rounded border px-3 py-2" />
            </label>
          </div>
          <div className="flex gap-2">
            <button onClick={handleSave} className="rounded bg-blue-600 px-4 py-2 text-sm text-white">Lưu</button>
            <button onClick={() => { setEditing(false); setEditData(task); }} className="rounded border px-4 py-2 text-sm">Hủy</button>
          </div>
        </div>
      )}

      {/* Main info */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-white p-6 rounded-lg border">
        <div>
          <label className="text-xs text-gray-500">{task.workType === "DAILY" ? (lang === "ja" ? "日常業務" : "Công việc hằng ngày") : (lang === "ja" ? "製品" : "Sản phẩm")}</label>
          <div className="flex items-center gap-2 mt-1">
            <span className="w-3 h-3 rounded-full" style={{ backgroundColor: task.workType === "DAILY" ? dailyWorkColor(task.dailyCategory, dailyCategories) : task.product?.color }} />
            <span className="font-medium">{task.workType === "DAILY" ? dailyWorkLabel(task.dailyCategory, lang, dailyCategories) : task.product?.name}</span>
          </div>
        </div>
        <div>
          <label className="text-xs text-gray-500">Người phụ trách</label>
          <p className="font-medium mt-1">{task.currentAssignee?.fullName || "Chưa phân công"}</p>
        </div>
        <div>
          <label className="text-xs text-gray-500">Ngày bắt đầu dự kiến</label>
          <p className="font-medium mt-1">{formatDate(task.plannedStartDate)}</p>
        </div>
        <div>
          <label className="text-xs text-gray-500">Ngày kết thúc dự kiến</label>
          <p className="font-medium mt-1">{formatDate(task.plannedEndDate)}</p>
        </div>
        {task.actualEndDate && (
          <div>
            <label className="text-xs text-gray-500">Ngày kết thúc thực tế</label>
            <p className="font-medium mt-1">{formatDate(task.actualEndDate)}</p>
          </div>
        )}
        <div>
          <label className="text-xs text-gray-500">Trạng thái</label>
          <div className="mt-1">
            <span className={`px-2 py-0.5 rounded-full text-xs ${STATUS_COLORS[task.status as TaskStatus]}`}>
              {STATUS_LABELS[task.status as TaskStatus]}
            </span>
          </div>
        </div>
        <div>
          <label className="text-xs text-gray-500">Tiến độ</label>
          <div className="flex items-center gap-2 mt-1">
            <div className="w-32 h-2 bg-gray-200 rounded-full">
              <div className="h-full bg-blue-500 rounded-full" style={{ width: `${task.progress}%` }} />
            </div>
            <span className="text-sm font-medium">{task.progress}%</span>
          </div>
        </div>
        <div>
          <label className="text-xs text-gray-500">Độ ưu tiên</label>
          <div className="mt-1">
            <span className={`px-2 py-0.5 rounded-full text-xs ${PRIORITY_COLORS[task.priority as TaskPriority]}`}>
              {PRIORITY_LABELS[task.priority as TaskPriority]}
            </span>
          </div>
        </div>
        {task.description && (
          <div className="col-span-2">
            <label className="text-xs text-gray-500">Mô tả</label>
            <p className="text-sm mt-1">{task.description}</p>
          </div>
        )}
        {task.note && (
          <div className="col-span-2">
            <label className="text-xs text-gray-500">Ghi chú</label>
            <p className="text-sm mt-1">{task.note}</p>
          </div>
        )}
      </div>

      {/* Quick actions for employee */}
      {(canUpdateOwn || canEdit) && (
        <div className="bg-white p-6 rounded-lg border">
          <h3 className="font-semibold text-gray-900 mb-3">Cập nhật nhanh</h3>
          <div className="flex flex-wrap gap-3">
            <select
              value={task.status}
              onChange={(e) => handleStatusUpdate(e.target.value)}
              className="border rounded px-3 py-1.5 text-sm"
            >
              <option value="PLANNED">Chưa bắt đầu</option>
              <option value="IN_PROGRESS">Đang thực hiện</option>
              <option value="WAITING">Đang chờ</option>
              <option value="COMPLETED">Hoàn thành</option>
              <option value="CANCELLED">Đã hủy</option>
            </select>
            <div className="flex items-center gap-2">
              <input
                type="range"
                min="0"
                max="100"
                value={task.progress}
                onChange={(e) => handleProgressUpdate(parseInt(e.target.value))}
                className="w-24"
              />
              <span className="text-sm font-medium">{task.progress}%</span>
            </div>
          </div>
        </div>
      )}

      {/* Comments */}
      <div className="bg-white p-6 rounded-lg border">
        <h3 className="font-semibold text-gray-900 mb-3">Bình luận</h3>
        {task.comments?.length === 0 && <p className="text-sm text-gray-400">Chưa có bình luận</p>}
        {task.comments?.map((c: any) => (
          <div key={c.id} className="py-2 border-b last:border-0">
            <p className="text-sm">
              <span className="font-medium">{c.author?.name}</span>
              <span className="text-gray-400 ml-2">{formatDate(c.createdAt, "dd/MM/yyyy HH:mm")}</span>
            </p>
            <p className="text-sm mt-1">{c.content}</p>
          </div>
        ))}
        {(canUpdateOwn || canEdit) && <div className="flex gap-2 mt-3">
          <input
            type="text"
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            placeholder="Thêm bình luận..."
            className="border rounded px-3 py-1.5 text-sm flex-1"
          />
          <button onClick={handleComment} className="px-3 py-1.5 bg-blue-600 text-white rounded text-sm">Gửi</button>
        </div>}
      </div>

      {/* Assignment History */}
      <div className="bg-white p-6 rounded-lg border">
        <h3 className="font-semibold text-gray-900 mb-3">Lịch sử phân công</h3>
        {task.assignmentHistory?.map((h: any) => (
          <div key={h.id} className="py-2 border-b">
            <p className="text-sm">
              <span className="font-medium">{h.employee?.fullName}</span>
              <span className="text-gray-400 ml-2">
                {formatDate(h.assignedFrom)} - {h.assignedUntil ? formatDate(h.assignedUntil) : "Hiện tại"}
              </span>
            </p>
            {h.reason && <p className="text-xs text-gray-500 mt-0.5">{h.reason}</p>}
          </div>
        ))}
      </div>

      {/* Reassign form for managers */}
      {canAssign && (
        <div className="bg-white p-6 rounded-lg border">
          <h3 className="font-semibold text-gray-900 mb-3">Chuyển task</h3>
          <form onSubmit={handleReassign} className="flex flex-wrap gap-3 items-end">
            <select name="employeeId" className="border rounded px-3 py-1.5 text-sm" required>
              <option value="">Chọn nhân viên...</option>
              {employees
                .filter((employee) => employee.isActive && employee.id !== task.currentAssigneeId)
                .map((employee) => <option key={employee.id} value={employee.id}>{employee.fullName}</option>)}
            </select>
            <input name="reason" maxLength={1000} placeholder="Lý do chuyển task (không bắt buộc)..." className="border rounded px-3 py-1.5 text-sm flex-1 min-w-[200px]" />
            <button type="submit" className="px-4 py-1.5 bg-blue-600 text-white rounded text-sm">Chuyển</button>
          </form>
          {task.currentAssigneeId && !isTerminalTask && (
            <form onSubmit={handleUnassign} data-i18n-ignore className="task-unassign-panel mt-5 rounded-lg border border-orange-200 bg-orange-50 p-4">
              <h4 className="task-unassign-title text-sm font-semibold text-orange-900">
                {lang === "ja" ? "未割り当てへ戻す" : "Thu hồi về chờ phân công"}
              </h4>
              <p className="mt-1 text-xs text-gray-500">
                {lang === "ja"
                  ? "担当者を解除し、このタスクを未割り当てタスク一覧とスケジュールへ戻します。ステータスと進捗は保持されます。"
                  : "Gỡ người phụ trách và đưa task về bảng/lịch chờ. Trạng thái và tiến độ được giữ nguyên."}
              </p>
              <div className="mt-3 flex flex-wrap items-end gap-3">
                <label className="min-w-[260px] flex-1 text-sm">
                  <span>{lang === "ja" ? "理由（任意）" : "Lý do thu hồi (không bắt buộc)"}</span>
                  <input
                    maxLength={1000}
                    value={unassignReason}
                    onChange={(event) => setUnassignReason(event.target.value)}
                    placeholder={lang === "ja" ? "未割り当てへ戻す理由（任意）..." : "Nhập lý do thu hồi nếu cần..."}
                    className="mt-1 w-full rounded border px-3 py-1.5 text-sm"
                  />
                </label>
                <button type="submit" disabled={unassigning} className="task-unassign-button rounded bg-orange-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-orange-700 disabled:opacity-50">
                  {unassigning
                    ? (lang === "ja" ? "処理中..." : "Đang thu hồi...")
                    : (lang === "ja" ? "未割り当てへ戻す" : "Thu hồi về hàng chờ")}
                </button>
              </div>
            </form>
          )}
          {task.currentAssigneeId && isTerminalTask && (
            <p data-i18n-ignore className="mt-5 border-t pt-4 text-xs text-gray-500">
              {lang === "ja"
                ? "完了またはキャンセル済みのタスクは未割り当てに戻せません。"
                : "Task hoàn thành hoặc đã hủy không thể thu hồi về hàng chờ."}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
