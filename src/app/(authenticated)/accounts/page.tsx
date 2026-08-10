"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { useLang } from "@/lib/i18n";

type Role = "ADMIN" | "MANAGER" | "EMPLOYEE";
type EmployeeOption = { id: string; employeeCode: string; fullName: string; user: { id: string } | null };
type Account = {
  id: string; name: string; username: string; role: Role; employeeId: string | null;
  isActive: boolean; createdAt: string;
  employee: { employeeCode: string; fullName: string; isActive: boolean } | null;
};

const copy = {
  vi: {
    title: "Quản lý tài khoản", add: "+ Tạo tài khoản",
    denied: "Chỉ Admin mới có quyền quản lý tài khoản.", loading: "Đang tải...",
    name: "Tên hiển thị", username: "Tên đăng nhập", password: "Mật khẩu",
    usernameHint: "3-50 ký tự: chữ, số, dấu chấm, gạch dưới hoặc gạch ngang",
    passwordHint: "Ít nhất 12 ký tự", newPassword: "Mật khẩu mới (để trống nếu không đổi)",
    role: "Quyền", employee: "Nhân viên liên kết", selectEmployee: "Chọn nhân viên...",
    roleAdmin: "Quản trị viên", roleManager: "Quản lý", roleEmployee: "Nhân viên",
    noEmployee: "Không liên kết", status: "Trạng thái", active: "Hoạt động", inactive: "Đã khóa",
    create: "Tạo tài khoản", update: "Lưu thay đổi", cancel: "Hủy", edit: "Sửa",
    lock: "Khóa", unlock: "Mở khóa", empty: "Chưa có tài khoản.",
    confirmLock: "Khóa tài khoản này? Người dùng sẽ không thể đăng nhập.",
    saved: "Đã cập nhật tài khoản.", created: "Đã tạo tài khoản.",
    genericError: "Không thể lưu tài khoản.",
    employeeRequired: "Tài khoản Nhân viên phải liên kết với một hồ sơ nhân viên.",
    duplicate: "Tên đăng nhập hoặc nhân viên này đã được liên kết với tài khoản khác.",
    invalidUsername: "Tên đăng nhập phải có 3-50 ký tự và chỉ gồm chữ, số, dấu chấm, gạch dưới hoặc gạch ngang.",
    weakPassword: "Mật khẩu phải có ít nhất 12 ký tự.",
    lastAdmin: "Không thể khóa hoặc hạ quyền Admin cuối cùng.",
    selfLockout: "Bạn không thể tự khóa hoặc bỏ quyền Admin của chính mình.",
    invalidEmployee: "Nhân viên không tồn tại hoặc đã ngừng hoạt động.",
  },
  ja: {
    title: "アカウント管理", add: "+ アカウント作成",
    denied: "アカウントを管理できるのは管理者のみです。", loading: "読み込み中...",
    name: "表示名", username: "ユーザー名", password: "パスワード",
    usernameHint: "3～50文字：英数字、ピリオド、アンダースコア、ハイフン",
    passwordHint: "12文字以上", newPassword: "新しいパスワード（変更しない場合は空欄）",
    role: "権限", employee: "連携する社員", selectEmployee: "社員を選択...",
    roleAdmin: "管理者", roleManager: "マネージャー", roleEmployee: "社員",
    noEmployee: "連携なし", status: "ステータス", active: "有効", inactive: "ロック中",
    create: "アカウント作成", update: "変更を保存", cancel: "キャンセル", edit: "編集",
    lock: "ロック", unlock: "ロック解除", empty: "アカウントがありません。",
    confirmLock: "このアカウントをロックしますか？ログインできなくなります。",
    saved: "アカウントを更新しました。", created: "アカウントを作成しました。",
    genericError: "アカウントを保存できません。",
    employeeRequired: "社員アカウントは社員情報との連携が必要です。",
    duplicate: "このユーザー名または社員は別のアカウントに連携されています。",
    invalidUsername: "ユーザー名は3～50文字で、英数字・ピリオド・アンダースコア・ハイフンのみ使用できます。",
    weakPassword: "パスワードは12文字以上で入力してください。",
    lastAdmin: "最後の有効な管理者はロックまたは降格できません。",
    selfLockout: "自分のアカウントをロックしたり、管理者権限を外したりすることはできません。",
    invalidEmployee: "社員が存在しないか、無効になっています。",
  },
};

const blankForm = { name: "", username: "", password: "", role: "EMPLOYEE" as Role, employeeId: "" };

export default function AccountsPage() {
  const { data: session, status } = useSession();
  const { lang } = useLang();
  const text = copy[lang];
  const currentUser = session?.user as { id?: string; role?: string } | undefined;
  const isAdmin = currentUser?.role === "ADMIN";
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Account | null>(null);
  const [form, setForm] = useState(blankForm);
  const [errorMessage, setErrorMessage] = useState("");

  const load = useCallback(async () => {
    if (!isAdmin) return;
    const response = await fetch("/api/users", { cache: "no-store" });
    const json = await response.json();
    if (json.success) { setAccounts(json.data.users); setEmployees(json.data.employees); }
    setLoading(false);
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    fetch("/api/users", { cache: "no-store" })
      .then((response) => response.json())
      .then((json) => {
        if (!cancelled && json.success) {
          setAccounts(json.data.users);
          setEmployees(json.data.employees);
        }
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [isAdmin]);

  const employeeOptions = useMemo(
    () => employees.filter((employee) => !employee.user || employee.id === editing?.employeeId),
    [employees, editing],
  );

  function closeForm() {
    setShowForm(false); setEditing(null); setForm(blankForm); setErrorMessage("");
  }
  function startCreate() {
    setEditing(null); setForm(blankForm); setErrorMessage(""); setShowForm(true);
  }
  function startEdit(account: Account) {
    setEditing(account);
    setForm({ name: account.name, username: account.username, password: "", role: account.role, employeeId: account.employeeId || "" });
    setErrorMessage(""); setShowForm(true);
  }

  function localizedError(json: { error?: { code?: string } }) {
    const messages: Record<string, string> = {
      DUPLICATE: text.duplicate,
      WEAK_PASSWORD: text.weakPassword,
      LAST_ADMIN: text.lastAdmin,
      SELF_LOCKOUT: text.selfLockout,
      INVALID_EMPLOYEE: text.invalidEmployee,
      EMPLOYEE_REQUIRED: text.employeeRequired,
      VALIDATION_ERROR: text.invalidUsername,
    };
    return messages[json.error?.code || ""] || text.genericError;
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (form.role === "EMPLOYEE" && !form.employeeId) { setErrorMessage(text.employeeRequired); return; }
    setSaving(true); setErrorMessage("");
    const response = await fetch(editing ? `/api/users/${editing.id}` : "/api/users", {
      method: editing ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, employeeId: form.employeeId || null }),
    });
    const json = await response.json();
    setSaving(false);
    if (!json.success) { setErrorMessage(localizedError(json)); return; }
    alert(editing ? text.saved : text.created);
    closeForm(); await load();
  }

  async function toggle(account: Account) {
    if (account.isActive && !confirm(text.confirmLock)) return;
    const response = await fetch(`/api/users/${account.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !account.isActive }),
    });
    const json = await response.json();
    if (!json.success) alert(localizedError(json)); else await load();
  }

  if (status === "loading") return <div className="p-6 text-gray-500">{text.loading}</div>;
  if (!isAdmin) return <div className="p-6"><div className="rounded-lg bg-yellow-50 p-4 text-yellow-800">{text.denied}</div></div>;

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900">{text.title}</h2>
        <button onClick={startCreate} className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700">{text.add}</button>
      </div>

      {showForm && (
        <form onSubmit={save} className="rounded-lg border bg-white p-5 space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <label className="space-y-1 text-sm"><span>{text.name}</span><input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full rounded border px-3 py-2" /></label>
            <label className="space-y-1 text-sm"><span>{text.username}</span><input required minLength={3} maxLength={50} pattern="[A-Za-z0-9._-]+" autoComplete="username" value={form.username} placeholder={text.usernameHint} onChange={(e) => setForm({ ...form, username: e.target.value.toLowerCase() })} className="w-full rounded border px-3 py-2" /></label>
            <label className="space-y-1 text-sm"><span>{editing ? text.newPassword : text.password}</span><input required={!editing} minLength={12} type="password" value={form.password} placeholder={text.passwordHint} onChange={(e) => setForm({ ...form, password: e.target.value })} className="w-full rounded border px-3 py-2" /></label>
            <label className="space-y-1 text-sm"><span>{text.role}</span><select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role, employeeId: e.target.value === "EMPLOYEE" ? form.employeeId : "" })} className="w-full rounded border px-3 py-2"><option value="EMPLOYEE">{text.roleEmployee}</option><option value="MANAGER">{text.roleManager}</option><option value="ADMIN">{text.roleAdmin}</option></select></label>
            {form.role === "EMPLOYEE" && <label className="space-y-1 text-sm md:col-span-2"><span>{text.employee}</span><select required value={form.employeeId} onChange={(e) => setForm({ ...form, employeeId: e.target.value })} className="w-full rounded border px-3 py-2"><option value="">{text.selectEmployee}</option>{employeeOptions.map((employee) => <option key={employee.id} value={employee.id}>{employee.employeeCode} — {employee.fullName}</option>)}</select></label>}
          </div>
          {errorMessage && <p className="text-sm text-red-600">{errorMessage}</p>}
          <div className="flex gap-2"><button disabled={saving} className="rounded bg-blue-600 px-4 py-2 text-sm text-white disabled:opacity-50">{editing ? text.update : text.create}</button><button type="button" onClick={closeForm} className="rounded border px-4 py-2 text-sm">{text.cancel}</button></div>
        </form>
      )}

      <div className="overflow-x-auto rounded-lg border bg-white">
        {loading ? <div className="p-8 text-center text-gray-500">{text.loading}</div> : accounts.length === 0 ? <div className="p-8 text-center text-gray-500">{text.empty}</div> : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-gray-600"><tr><th className="px-4 py-3">{text.name}</th><th className="px-4 py-3">{text.username}</th><th className="px-4 py-3">{text.role}</th><th className="px-4 py-3">{text.employee}</th><th className="px-4 py-3">{text.status}</th><th className="px-4 py-3"></th></tr></thead>
            <tbody className="divide-y">{accounts.map((account) => <tr key={account.id}><td className="px-4 py-3 font-medium">{account.name}</td><td className="px-4 py-3 font-mono">{account.username}</td><td className="px-4 py-3">{account.role === "ADMIN" ? text.roleAdmin : account.role === "MANAGER" ? text.roleManager : text.roleEmployee}</td><td className="px-4 py-3 text-gray-600">{account.employee ? `${account.employee.employeeCode} — ${account.employee.fullName}` : text.noEmployee}</td><td className="px-4 py-3"><span className={`rounded-full px-2 py-1 text-xs ${account.isActive ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"}`}>{account.isActive ? text.active : text.inactive}</span></td><td className="px-4 py-3 text-right space-x-3"><button onClick={() => startEdit(account)} className="text-blue-600 hover:underline">{text.edit}</button><button disabled={account.id === currentUser?.id} onClick={() => toggle(account)} className="text-orange-600 hover:underline disabled:text-gray-300 disabled:no-underline">{account.isActive ? text.lock : text.unlock}</button></td></tr>)}</tbody>
          </table>
        )}
      </div>
    </div>
  );
}
