"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { useLang } from "@/lib/i18n";
import { formatDate } from "@/lib/date";
import { hasPermission, type AppPermission } from "@/lib/permissions";
import { TEST_ENVIRONMENT_OS_GROUPS } from "@/config/test-environment-os";

interface Product { id: string; code: string; name: string; color: string; isActive: boolean; }
interface Employee { id: string; employeeCode: string; fullName: string; isActive: boolean; team?: { name: string } | null; }
interface OsOption { id: string; name: string; groupName: string; sortOrder: number; isActive: boolean; }
interface TestEnvironment {
  id: string; type: "PERSONAL" | "SHARED"; productId: string; employeeId: string | null;
  usagePeriod: string | null; usageEndDate: string | null; os: string | null; setupType: string; virus: string | null;
  hostName: string | null; ip: string | null; url: string | null; deliveryDomain: string | null;
  version: string | null; buildInfo: string | null; commonVersion: string | null; sophosVersion: string | null;
  product: Product | null; employee: { id: string; fullName: string; employeeCode: string } | null;
  createdBy: { id: string; name: string } | null;
}

interface UsageRecord {
  id: string; startDate: string; endDate: string; registeredAt: string;
  releasedAt: string | null; releaseReason: string | null;
  employee: { id: string; fullName: string; employeeCode: string };
  releasedBy: { id: string; name: string } | null;
}

type TabKey = "ALL" | "SHARED" | "PERSONAL" | "MINE";
type StatusKey = "" | "AVAILABLE" | "IN_USE" | "ASSIGNED";

const EMPTY_FORM: Record<string, string> = {
  type: "PERSONAL", productId: "", employeeId: "", usagePeriod: "", usageEndDate: "", os: "", setupType: "NEW",
  virus: "", hostName: "", ip: "", url: "", deliveryDomain: "", version: "",
  buildInfo: "", commonVersion: "", sophosVersion: "",
};

const PAGE_SIZE = 20;
const CUSTOM_OS_VALUE = "__CUSTOM__";
const EXPIRY_WARNING_DAYS = 3;

function toInputDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function inputDateAfter(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return toInputDate(date);
}

function daysLeftUntil(endDate: string | null): number | null {
  if (!endDate) return null;
  const end = new Date(`${endDate.slice(0, 10)}T00:00:00Z`).getTime();
  const today = new Date(`${toInputDate(new Date())}T00:00:00Z`).getTime();
  return Math.round((end - today) / 86_400_000);
}

const CSV_COLUMNS = [
  "type", "productCode", "employeeCode", "usagePeriod", "usageEndDate", "os", "setupType",
  "virus", "hostName", "ip", "url", "deliveryDomain", "version", "buildInfo", "commonVersion", "sophosVersion",
] as const;

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index++) {
    const char = line[index];
    if (quoted) {
      if (char === '"') {
        if (line[index + 1] === '"') { value += '"'; index++; } else { quoted = false; }
      } else {
        value += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      cells.push(value);
      value = "";
    } else {
      value += char;
    }
  }
  cells.push(value);
  return cells;
}

function csvCell(value: string | null | undefined): string {
  const text = value ?? "";
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function statusOf(env: TestEnvironment): "ASSIGNED" | "AVAILABLE" | "IN_USE" {
  if (env.type === "PERSONAL") return "ASSIGNED";
  return env.employeeId ? "IN_USE" : "AVAILABLE";
}

export default function TestEnvironmentsPage() {
  const { data: session } = useSession();
  const { t } = useLang();
  const user = session?.user as { role: "ADMIN" | "MANAGER" | "EMPLOYEE"; permissions?: AppPermission[]; employeeId?: string | null } | undefined;
  const isAdmin = user?.role === "ADMIN";
  const isEmployee = user?.role === "EMPLOYEE";
  const canManage = hasPermission(user, "ENVIRONMENT_MANAGE");
  const currentEmployeeId = user?.employeeId;

  const [environments, setEnvironments] = useState<TestEnvironment[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [osOptions, setOsOptions] = useState<OsOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [tab, setTab] = useState<TabKey>("ALL");
  const [statusFilter, setStatusFilter] = useState<StatusKey>("");
  const [productFilter, setProductFilter] = useState("");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formReadOnly, setFormReadOnly] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({ ...EMPTY_FORM });
  const [customOs, setCustomOs] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);

  const [collapsedProducts, setCollapsedProducts] = useState<Set<string>>(new Set());
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [registerFor, setRegisterFor] = useState<{ envId: string; employeeId: string; startDate: string; endDate: string } | null>(null);
  const [expiring, setExpiring] = useState<TestEnvironment[]>([]);
  const [historyFor, setHistoryFor] = useState<TestEnvironment | null>(null);
  const [history, setHistory] = useState<UsageRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(id);
  }, [search]);

  const fetchExpiring = useCallback(async () => {
    try {
      const res = await fetch(`/api/test-environments/expiring?days=${EXPIRY_WARNING_DAYS}`, { cache: "no-store" });
      const json = await res.json();
      if (json.success) setExpiring(json.data);
    } catch {
      // Cảnh báo chỉ là phụ trợ; lỗi API không chặn màn hình chính.
    }
  }, []);

  const fetchEnvironments = useCallback(async () => {
    const params = new URLSearchParams();
    if (productFilter) params.set("productId", productFilter);
    if (debouncedSearch.trim()) params.set("search", debouncedSearch.trim());
    try {
      const res = await fetch(`/api/test-environments?${params.toString()}`, { cache: "no-store" });
      const json = await res.json();
      if (!json.success) throw new Error();
      setEnvironments(json.data);
      setError("");
      void fetchExpiring();
    } catch {
      setError(t.testEnv.loadError);
    } finally {
      setLoading(false);
    }
  }, [productFilter, debouncedSearch, t.testEnv.loadError, fetchExpiring]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async fetch (setState after await)
    fetchEnvironments();
  }, [fetchEnvironments]);

  useEffect(() => {
    fetch("/api/products").then((r) => r.json()).then((j) => j.success && setProducts(j.data.filter((p: Product) => p.isActive)));
    fetch("/api/employees?pageSize=100").then((r) => r.json()).then((j) => j.success && setEmployees(j.data.employees.filter((e: Employee) => e.isActive)));
    // Danh sách OS do Admin cấu hình ở trang Cài đặt; lỗi API thì dùng danh sách mặc định.
    fetch("/api/test-environment-os?active=true")
      .then((r) => r.json())
      .then((j) => { if (j.success) setOsOptions(j.data); })
      .catch(() => undefined);
  }, []);

  const tabCounts = useMemo(() => ({
    ALL: environments.length,
    SHARED: environments.filter((e) => e.type === "SHARED").length,
    PERSONAL: environments.filter((e) => e.type === "PERSONAL").length,
    MINE: environments.filter((e) => e.employeeId && e.employeeId === currentEmployeeId).length,
  }), [environments, currentEmployeeId]);

  const filtered = useMemo(() => environments.filter((env) => {
    if (tab === "SHARED" && env.type !== "SHARED") return false;
    if (tab === "PERSONAL" && env.type !== "PERSONAL") return false;
    if (tab === "MINE" && (!currentEmployeeId || env.employeeId !== currentEmployeeId)) return false;
    if (statusFilter && statusOf(env) !== statusFilter) return false;
    return true;
  }), [environments, tab, statusFilter, currentEmployeeId]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paged = useMemo(() => filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE), [filtered, safePage]);

  const groupedPage = useMemo(() => {
    const map = new Map<string, { key: string; product: Product | null; items: TestEnvironment[] }>();
    for (const env of paged) {
      const key = env.product?.id || "unknown";
      if (!map.has(key)) map.set(key, { key, product: env.product, items: [] });
      map.get(key)!.items.push(env);
    }
    return [...map.values()];
  }, [paged]);

  const osGroups = useMemo<readonly { label: string; options: readonly string[] }[]>(() => {
    if (osOptions.length === 0) return TEST_ENVIRONMENT_OS_GROUPS;
    const groups = new Map<string, string[]>();
    for (const option of osOptions) {
      const label = option.groupName?.trim() || "Khác";
      const names = groups.get(label) ?? [];
      names.push(option.name);
      groups.set(label, names);
    }
    return [...groups.entries()].map(([label, options]) => ({ label, options }));
  }, [osOptions]);

  const osNames = useMemo(() => new Set(osGroups.flatMap((group) => group.options)), [osGroups]);

  function openCreate() {
    setEditingId(null);
    setFormReadOnly(false);
    setForm({ ...EMPTY_FORM, employeeId: isEmployee ? (user?.employeeId || "") : "" });
    setCustomOs(false);
    setError("");
    setShowForm(true);
  }

  function openForm(env: TestEnvironment, readOnly: boolean) {
    setEditingId(env.id);
    setFormReadOnly(readOnly);
    setCustomOs(Boolean(env.os && !osNames.has(env.os)));
    setForm({
      type: env.type,
      productId: env.productId,
      employeeId: env.employeeId || "",
      usagePeriod: env.usagePeriod ? env.usagePeriod.slice(0, 10) : "",
      usageEndDate: env.usageEndDate ? env.usageEndDate.slice(0, 10) : "",
      os: env.os || "",
      setupType: env.setupType || "NEW",
      virus: env.virus || "",
      hostName: env.hostName || "",
      ip: env.ip || "",
      url: env.url || "",
      deliveryDomain: env.deliveryDomain || "",
      version: env.version || "",
      buildInfo: env.buildInfo || "",
      commonVersion: env.commonVersion || "",
      sophosVersion: env.sophosVersion || "",
    });
    setError("");
    setShowForm(true);
  }

  async function submitForm(e: React.FormEvent) {
    e.preventDefault();
    if (formReadOnly) return;
    setSaving(true);
    setError("");
    const url = editingId ? `/api/test-environments/${editingId}` : "/api/test-environments";
    const method = editingId ? "PATCH" : "POST";
    try {
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const json = await res.json();
      if (!json.success) { setError(json.error?.message || t.common.save); return; }
      setShowForm(false);
      setEditingId(null);
      await fetchEnvironments();
    } catch {
      setError(t.testEnv.loadError);
    } finally {
      setSaving(false);
    }
  }

  function showToast(message: string) {
    setToast(message);
    setTimeout(() => setToast(null), 2200);
  }

  function startRegister(env: TestEnvironment) {
    setRegisterFor({
      envId: env.id,
      employeeId: user?.employeeId || "",
      startDate: toInputDate(new Date()),
      endDate: inputDateAfter(7),
    });
  }

  async function register(id: string, employeeId?: string, startDate?: string, endDate?: string) {
    setBusy(true);
    try {
      const body = {
        ...(employeeId ? { employeeId } : {}),
        ...(startDate ? { startDate } : {}),
        ...(endDate ? { endDate } : {}),
      };
      const res = await fetch(`/api/test-environments/${id}/register`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        setRegisterFor(null);
        await fetchEnvironments();
      } else {
        showToast(json.error?.code === "NO_EMPLOYEE" ? t.testEnv.noEmployee : (json.error?.message || t.testEnv.registerFailed));
      }
    } finally {
      setBusy(false);
    }
  }

  async function release(id: string) {
    if (!confirm(t.testEnv.confirmRelease)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/test-environments/${id}/release`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        await fetchEnvironments();
      } else {
        showToast(json.error?.message || t.testEnv.releaseFailed);
      }
    } finally {
      setBusy(false);
    }
  }

  async function importCsv(file: File) {
    const content = (await file.text()).replace(/^\uFEFF/, "");
    const rows = content.split(/\r?\n/).filter((line) => line.trim()).map(parseCsvLine);
    if (rows.length === 0) {
      alert(t.testEnv.importFailed);
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/test-environments/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) {
        alert(json.error?.message || t.testEnv.importFailed);
        return;
      }
      const { imported, skipped, errors } = json.data as { imported: number; skipped: number; errors: string[] };
      await fetchEnvironments();
      const detail = errors?.length
        ? `\n\n${errors.slice(0, 5).join("\n")}${errors.length > 5 ? "\n..." : ""}`
        : "";
      alert(`${t.testEnv.importSuccess} ${imported} ${t.testEnv.importRows}, ${t.testEnv.importSkipped} ${skipped} ${t.testEnv.importRows}.${detail}`);
    } catch {
      alert(t.testEnv.importFailed);
    } finally {
      setBusy(false);
    }
  }

  function exportCsv() {
    const lines = [CSV_COLUMNS.join(",")];
    for (const env of environments) {
      lines.push([
        env.type, env.product?.code, env.employee?.employeeCode,
        env.usagePeriod ? env.usagePeriod.slice(0, 10) : "",
        env.usageEndDate ? env.usageEndDate.slice(0, 10) : "",
        env.os, env.setupType, env.virus, env.hostName, env.ip, env.url,
        env.deliveryDomain, env.version, env.buildInfo, env.commonVersion, env.sophosVersion,
      ].map(csvCell).join(","));
    }
    const blob = new Blob([`\uFEFF${lines.join("\r\n")}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `test-environments-${toInputDate(new Date())}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function openHistory(env: TestEnvironment) {
    setOpenMenuId(null);
    setHistoryFor(env);
    setHistory([]);
    setHistoryLoading(true);
    try {
      const res = await fetch(`/api/test-environments/${env.id}/usages`, { cache: "no-store" });
      const json = await res.json();
      if (json.success) setHistory(json.data);
    } catch {
      showToast(t.testEnv.historyFailed);
    } finally {
      setHistoryLoading(false);
    }
  }

  async function remove(id: string) {
    if (!confirm(t.testEnv.confirmDelete)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/test-environments/${id}`, { method: "DELETE" });
      if (res.ok) await fetchEnvironments();
    } finally {
      setBusy(false);
    }
  }

  function copy(value: string) {
    navigator.clipboard?.writeText(value)
      .then(() => { setToast(t.testEnv.copySuccess); setTimeout(() => setToast(null), 1800); })
      .catch(() => { setToast(t.testEnv.copyFailed); setTimeout(() => setToast(null), 1800); });
  }

  function toggleProduct(id: string) {
    setCollapsedProducts((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function canEdit(env: TestEnvironment) {
    if (isAdmin) return true;
    if (env.type === "SHARED") return canManage;
    return env.employeeId === user?.employeeId || canManage;
  }

  function canDelete(env: TestEnvironment) {
    if (env.type === "SHARED") return isAdmin;
    return env.employeeId === user?.employeeId || canManage;
  }

  const label = (value: string | null) => value || "—";
  const dateLabel = (value: string | null) => (value ? formatDate(value) : "—");
  const buildText = (env: TestEnvironment) =>
    `${t.testEnv.buildInfoLabel}: ${label(env.buildInfo)}\n${t.testEnv.commonLabel}: ${label(env.commonVersion)}\n${t.testEnv.sophosLabel}: ${label(env.sophosVersion)}`;

  function changeTab(next: TabKey) { setTab(next); setPage(1); }
  function changeStatus(next: StatusKey) { setStatusFilter(next); setPage(1); }
  function changeProduct(next: string) { setProductFilter(next); setPage(1); }
  function changeSearch(next: string) { setSearch(next); setPage(1); }

  return (
    <div className="space-y-4 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">{t.common.testEnvironments}</h2>
          <p className="text-sm text-gray-500">{t.testEnv.personal} / {t.testEnv.shared}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canManage && (
            <label className="cursor-pointer rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700">
              📥 {t.testEnv.importCsv}
              <input
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                disabled={busy}
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  if (file) await importCsv(file);
                  event.target.value = "";
                }}
              />
            </label>
          )}
          <button type="button" onClick={exportCsv} className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700">📤 {t.testEnv.exportCsv}</button>
          <button type="button" onClick={openCreate} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">+ {t.testEnv.add}</button>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {([["ALL", t.testEnv.tabAll], ["SHARED", t.testEnv.tabShared], ["PERSONAL", t.testEnv.tabPersonal], ["MINE", t.testEnv.tabMine]] as [TabKey, string][]).map(([key, text]) => (
            <button key={key} type="button" onClick={() => changeTab(key)} className={`rounded-lg px-3 py-1.5 text-sm font-medium ${tab === key ? "bg-blue-600 text-white" : "border bg-white text-gray-600 hover:bg-gray-50"}`}>
              {text} ({tabCounts[key]})
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          <input value={search} onChange={(e) => changeSearch(e.target.value)} placeholder={t.testEnv.searchPlaceholder} className="min-w-52 flex-1 rounded-lg border px-3 py-2 text-sm" />
          <select value={productFilter} onChange={(e) => changeProduct(e.target.value)} className="rounded-lg border px-3 py-2 text-sm">
            <option value="">{t.testEnv.allProducts}</option>
            {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select value={statusFilter} onChange={(e) => changeStatus(e.target.value as StatusKey)} className="rounded-lg border px-3 py-2 text-sm">
            <option value="">{t.testEnv.allStatuses}</option>
            <option value="AVAILABLE">{t.testEnv.statusAvailable}</option>
            <option value="IN_USE">{t.testEnv.statusInUse}</option>
            <option value="ASSIGNED">{t.testEnv.statusAssigned}</option>
          </select>
        </div>
      </div>

      {error && <div className="rounded border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>}

      {expiring.length > 0 && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-semibold">{t.testEnv.expiringTitle} ({expiring.length})</p>
            <p className="text-xs">{t.testEnv.expiringHint}</p>
          </div>
          <ul className="mt-2 space-y-1">
            {expiring.slice(0, 5).map((env) => {
              const left = daysLeftUntil(env.usageEndDate);
              return (
                <li key={env.id} className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${left !== null && left < 0 ? "bg-red-100 text-red-700" : "bg-amber-200 text-amber-900"}`}>
                    {left !== null && left < 0 ? `${t.testEnv.overdueBy} ${Math.abs(left)} ${t.testEnv.dayUnit}` : `${t.testEnv.expiringIn} ${left ?? 0} ${t.testEnv.dayUnit}`}
                  </span>
                  <span className="font-medium">{env.hostName || env.product?.name || "—"}</span>
                  <span className="text-xs text-amber-800">
                    {env.product?.name ? `· ${env.product.name}` : ""} · {env.employee?.fullName || "—"}
                    {env.employeeId === currentEmployeeId && <span className="ml-1 text-blue-600">{t.testEnv.you}</span>}
                    {" · "}{env.usageEndDate ? formatDate(env.usageEndDate, "dd/MM/yyyy") : "—"}
                  </span>
                  {(env.employeeId === currentEmployeeId || canManage) && (
                    <button type="button" disabled={busy} onClick={() => release(env.id)} className="rounded border border-amber-500 px-2 py-0.5 text-xs font-medium text-amber-800 hover:bg-amber-100 disabled:opacity-50">{t.testEnv.release}</button>
                  )}
                </li>
              );
            })}
          </ul>
          {expiring.length > 5 && <p className="mt-1 text-xs">+{expiring.length - 5} {t.testEnv.moreItems}</p>}
        </div>
      )}

      {showForm && (
        <form onSubmit={submitForm} className="grid gap-4 rounded-lg border bg-white p-5 md:grid-cols-3">
          <h3 className="text-lg font-semibold text-gray-900 md:col-span-3">{editingId ? (formReadOnly ? t.testEnv.viewDetail : t.common.edit) : t.testEnv.add}</h3>

          <label className="text-sm">{t.testEnv.type}
            <select disabled={formReadOnly || isEmployee} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value, employeeId: e.target.value === "SHARED" ? "" : form.employeeId })} className="mt-1 w-full rounded border px-3 py-2">
              <option value="PERSONAL">{t.testEnv.personal}</option>
              {!isEmployee && <option value="SHARED">{t.testEnv.shared}</option>}
            </select>
          </label>

          <label className="text-sm">{t.testEnv.product} *
            <select disabled={formReadOnly} required value={form.productId} onChange={(e) => setForm({ ...form, productId: e.target.value })} className="mt-1 w-full rounded border px-3 py-2">
              <option value="">{t.testEnv.allProducts}...</option>
              {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>

          {form.type === "PERSONAL" && (
            <label className="text-sm">{t.testEnv.userName}
              <select disabled={formReadOnly || isEmployee} value={form.employeeId} onChange={(e) => setForm({ ...form, employeeId: e.target.value })} className="mt-1 w-full rounded border px-3 py-2">
                <option value="">—</option>
                {employees.map((emp) => <option key={emp.id} value={emp.id}>{emp.fullName} ({emp.employeeCode})</option>)}
              </select>
            </label>
          )}

          <label className="text-sm">{t.testEnv.usagePeriod}
            <input type="date" disabled={formReadOnly} value={form.usagePeriod} onChange={(e) => setForm({ ...form, usagePeriod: e.target.value })} className="mt-1 w-full rounded border px-3 py-2" />
          </label>
          <label className="text-sm">{t.testEnv.usageEndDate}
            <input type="date" disabled={formReadOnly} min={form.usagePeriod || undefined} value={form.usageEndDate} onChange={(e) => setForm({ ...form, usageEndDate: e.target.value })} className="mt-1 w-full rounded border px-3 py-2" />
          </label>
          <label className="text-sm">{t.testEnv.os}
            <select
              disabled={formReadOnly}
              value={customOs ? CUSTOM_OS_VALUE : form.os}
              onChange={(e) => {
                const value = e.target.value;
                if (value === CUSTOM_OS_VALUE) {
                  setCustomOs(true);
                  setForm({ ...form, os: "" });
                  return;
                }
                setCustomOs(false);
                setForm({ ...form, os: value });
              }}
              className="mt-1 w-full rounded border px-3 py-2"
            >
              <option value="">—</option>
              {osGroups.map((group) => (
                <optgroup key={group.label} label={group.label}>
                  {group.options.map((option) => <option key={option} value={option}>{option}</option>)}
                </optgroup>
              ))}
              <option value={CUSTOM_OS_VALUE}>{t.testEnv.osOther}</option>
            </select>
            {customOs && (
              <input
                autoFocus
                disabled={formReadOnly}
                value={form.os}
                onChange={(e) => setForm({ ...form, os: e.target.value })}
                placeholder={t.testEnv.osOtherPlaceholder}
                className="mt-1 w-full rounded border px-3 py-2"
              />
            )}
          </label>
          <label className="text-sm">{t.testEnv.setupType}
            <select disabled={formReadOnly} value={form.setupType} onChange={(e) => setForm({ ...form, setupType: e.target.value })} className="mt-1 w-full rounded border px-3 py-2">
              <option value="NEW">{t.testEnv.setupNew}</option>
              <option value="UPDATE">{t.testEnv.setupUpdate}</option>
            </select>
          </label>
          <label className="text-sm">{t.testEnv.virus}
            <input disabled={formReadOnly} value={form.virus} onChange={(e) => setForm({ ...form, virus: e.target.value })} className="mt-1 w-full rounded border px-3 py-2" />
          </label>
          <label className="text-sm">{t.testEnv.hostName}
            <input disabled={formReadOnly} value={form.hostName} onChange={(e) => setForm({ ...form, hostName: e.target.value })} className="mt-1 w-full rounded border px-3 py-2" />
          </label>
          <label className="text-sm">{t.testEnv.ip}
            <input disabled={formReadOnly} value={form.ip} onChange={(e) => setForm({ ...form, ip: e.target.value })} className="mt-1 w-full rounded border px-3 py-2 font-mono" />
          </label>
          <label className="text-sm">{t.testEnv.url}
            <input disabled={formReadOnly} value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} className="mt-1 w-full rounded border px-3 py-2" />
          </label>
          <label className="text-sm">{t.testEnv.deliveryDomain}
            <input disabled={formReadOnly} value={form.deliveryDomain} onChange={(e) => setForm({ ...form, deliveryDomain: e.target.value })} className="mt-1 w-full rounded border px-3 py-2" />
          </label>
          <label className="text-sm">{t.testEnv.version}
            <input disabled={formReadOnly} value={form.version} onChange={(e) => setForm({ ...form, version: e.target.value })} className="mt-1 w-full rounded border px-3 py-2" />
          </label>
          <label className="text-sm">{t.testEnv.buildInfoLabel}
            <input disabled={formReadOnly} value={form.buildInfo} onChange={(e) => setForm({ ...form, buildInfo: e.target.value })} placeholder="2.20.0(29845)" className="mt-1 w-full rounded border px-3 py-2 font-mono" />
          </label>
          <label className="text-sm">{t.testEnv.commonLabel}
            <input disabled={formReadOnly} value={form.commonVersion} onChange={(e) => setForm({ ...form, commonVersion: e.target.value })} placeholder="12.48.1(28380)" className="mt-1 w-full rounded border px-3 py-2 font-mono" />
          </label>
          <label className="text-sm">{t.testEnv.sophosLabel}
            <input disabled={formReadOnly} value={form.sophosVersion} onChange={(e) => setForm({ ...form, sophosVersion: e.target.value })} placeholder="3.5.0(29733)" className="mt-1 w-full rounded border px-3 py-2 font-mono" />
          </label>

          <div className="flex items-end gap-2 md:col-span-3">
            {!formReadOnly && <button type="submit" disabled={saving} className="rounded bg-blue-600 px-4 py-2 text-sm text-white disabled:opacity-50">{saving ? "..." : t.common.save}</button>}
            <button type="button" onClick={() => { setShowForm(false); setEditingId(null); }} className="rounded border px-4 py-2 text-sm">{t.common.cancel}</button>
          </div>
        </form>
      )}

      {loading ? (
        <p className="p-8 text-center text-sm text-gray-500">...</p>
      ) : filtered.length === 0 ? (
        <p className="p-8 text-center text-sm text-gray-500">{environments.length === 0 ? t.testEnv.empty : t.testEnv.noResults}</p>
      ) : (
        <>
          <div className="overflow-hidden rounded-lg border bg-white">
            <div className="max-h-[70vh] overflow-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10 bg-gray-50 text-left text-gray-600">
                  <tr>
                    <th className="px-4 py-3">{t.testEnv.hostName} / IP</th>
                    <th className="px-4 py-3">{t.testEnv.type} / {t.testEnv.status}</th>
                    <th className="px-4 py-3">{t.testEnv.userName}</th>
                    <th className="px-4 py-3">{t.testEnv.dateColumn}</th>
                    <th className="px-4 py-3">{t.testEnv.os}</th>
                    <th className="px-4 py-3">{t.testEnv.buildVersions}</th>
                    <th className="px-4 py-3">{t.testEnv.actions}</th>
                  </tr>
                </thead>
                <tbody>
                  {groupedPage.map((group) => {
                    const collapsed = collapsedProducts.has(group.key);
                    return (
                      <Fragment key={group.key}>
                        <tr className="bg-gray-100">
                          <td colSpan={7} className="px-4 py-2">
                            <button type="button" onClick={() => toggleProduct(group.key)} className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                              <span>{collapsed ? "▸" : "▾"}</span>
                              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: group.product?.color || "#6B7280" }} />
                              {group.product?.name || "—"} ({group.items.length})
                            </button>
                          </td>
                        </tr>
                        {!collapsed && group.items.map((env) => {
                          const st = statusOf(env);
                          const stText = st === "AVAILABLE" ? t.testEnv.statusAvailable : st === "IN_USE" ? t.testEnv.statusInUse : t.testEnv.statusAssigned;
                          const stClass = st === "AVAILABLE" ? "bg-green-100 text-green-700" : "bg-orange-100 text-orange-700";
                          const expiryLeft = env.type === "SHARED" && env.employeeId ? daysLeftUntil(env.usageEndDate) : null;
                          return (
                            <tr key={env.id} className="border-t align-top hover:bg-gray-50">
                              <td className="px-4 py-3">
                                <div className="font-semibold text-gray-900">{env.hostName || "—"}</div>
                                <div className="mt-0.5 flex items-center gap-1 font-mono text-xs text-gray-500">
                                  <span>{env.ip || "—"}</span>
                                  {env.ip && <button type="button" onClick={() => copy(env.ip!)} title={t.testEnv.ip} aria-label={t.testEnv.ip} className="hover:text-blue-600">⧉</button>}
                                </div>
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex flex-col items-start gap-1">
                                  <span className={`rounded-full px-2 py-0.5 text-xs ${env.type === "SHARED" ? "bg-purple-100 text-purple-700" : "bg-blue-100 text-blue-700"}`}>{env.type === "SHARED" ? t.testEnv.shared : t.testEnv.personal}</span>
                                  <span className={`rounded-full px-2 py-0.5 text-xs ${stClass}`}>{stText}</span>
                                </div>
                              </td>
                              <td className="px-4 py-3">
                                {env.employee ? (<span>{env.employee.fullName}{env.employeeId === user?.employeeId && <span className="ml-1 text-xs text-blue-600">{t.testEnv.you}</span>}</span>) : "—"}
                              </td>
                              <td className="whitespace-nowrap px-4 py-3 text-xs">
                                <div>{dateLabel(env.usagePeriod)}{env.usageEndDate ? ` → ${formatDate(env.usageEndDate, "dd/MM/yyyy")}` : ""}</div>
                                {expiryLeft !== null && expiryLeft <= EXPIRY_WARNING_DAYS && (
                                  <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[11px] ${expiryLeft < 0 ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>
                                    {expiryLeft < 0 ? `${t.testEnv.overdueBy} ${Math.abs(expiryLeft)} ${t.testEnv.dayUnit}` : `${t.testEnv.expiringIn} ${expiryLeft} ${t.testEnv.dayUnit}`}
                                  </span>
                                )}
                              </td>
                              <td className="px-4 py-3 text-xs">{label(env.os)}</td>
                              <td className="px-4 py-3">
                                <div className="flex items-start gap-2">
                                  <div className="grid grid-cols-[auto_1fr] gap-x-2 font-mono text-xs leading-5">
                                    <span className="text-gray-500">{t.testEnv.buildInfoLabel}:</span><span className="font-semibold text-gray-900">{label(env.buildInfo)}</span>
                                    <span className="text-gray-500">{t.testEnv.commonLabel}:</span><span className="text-gray-500">{label(env.commonVersion)}</span>
                                    <span className="text-gray-500">{t.testEnv.sophosLabel}:</span><span className="text-gray-500">{label(env.sophosVersion)}</span>
                                  </div>
                                  <button type="button" onClick={() => copy(buildText(env))} title={t.testEnv.copyBuild} aria-label={t.testEnv.copyBuild} className="text-gray-400 hover:text-blue-600">⧉</button>
                                </div>
                              </td>
                              <td className="relative whitespace-nowrap px-4 py-3">
                                <div className="flex items-center gap-2">
                                  {env.type === "SHARED" && !env.employeeId && (
                                    <button type="button" disabled={busy} onClick={() => startRegister(env)} className="rounded-lg border border-blue-500 px-3 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50 disabled:opacity-50">{t.testEnv.register}</button>
                                  )}
                                  {env.type === "SHARED" && env.employeeId && (env.employeeId === currentEmployeeId || canManage) && (
                                    <button type="button" disabled={busy} onClick={() => release(env.id)} className="rounded-lg border border-orange-400 px-3 py-1 text-xs font-medium text-orange-600 hover:bg-orange-50">{t.testEnv.release}</button>
                                  )}
                                  {(env.type === "PERSONAL" || (env.type === "SHARED" && env.employeeId && env.employeeId !== user?.employeeId)) && (
                                    <button type="button" onClick={() => openForm(env, !canEdit(env))} className="text-xs font-medium text-gray-600 hover:text-blue-600">▸ {t.testEnv.viewDetail}</button>
                                  )}
                                  <button type="button" onClick={() => setOpenMenuId(openMenuId === env.id ? null : env.id)} title={t.testEnv.actions} aria-label={t.testEnv.actions} className="rounded border px-2 py-1 text-xs">⋯</button>
                                  {openMenuId === env.id && (
                                    <div className="absolute right-4 top-full z-20 mt-1 w-40 rounded-lg border bg-white p-1 shadow-lg">
                                      <button type="button" onClick={() => openHistory(env)} className="block w-full rounded px-3 py-1.5 text-left text-xs hover:bg-gray-50">{t.testEnv.historyTitle}</button>
                                      {canEdit(env) && <button type="button" onClick={() => { setOpenMenuId(null); openForm(env, false); }} className="block w-full rounded px-3 py-1.5 text-left text-xs hover:bg-gray-50">{t.common.edit}</button>}
                                      {canDelete(env) && <button type="button" onClick={() => { setOpenMenuId(null); remove(env.id); }} className="block w-full rounded px-3 py-1.5 text-left text-xs text-red-600 hover:bg-gray-50">{t.common.delete}</button>}
                                    </div>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm text-gray-500">{t.testEnv.showing} {paged.length}/{filtered.length}</span>
            <div className="flex items-center gap-1">
              <button type="button" disabled={safePage <= 1} onClick={() => setPage(safePage - 1)} className="rounded border px-3 py-1 text-sm disabled:opacity-30">‹</button>
              <span className="px-2 text-sm">{safePage}/{totalPages}</span>
              <button type="button" disabled={safePage >= totalPages} onClick={() => setPage(safePage + 1)} className="rounded border px-3 py-1 text-sm disabled:opacity-30">›</button>
            </div>
          </div>
        </>
      )}

      {registerFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-lg border bg-white p-5 shadow-xl">
            <h3 className="mb-3 text-lg font-semibold text-gray-900">{t.testEnv.register}</h3>
            <div className="space-y-3">
              <label className="block text-sm">{t.testEnv.userName}
                <select value={registerFor.employeeId} onChange={(e) => setRegisterFor({ ...registerFor, employeeId: e.target.value })} className="mt-1 w-full rounded border px-3 py-2">
                  <option value="">—</option>
                  {employees.map((emp) => <option key={emp.id} value={emp.id}>{emp.fullName} ({emp.employeeCode})</option>)}
                </select>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-sm">{t.testEnv.usagePeriod}
                  <input type="date" value={registerFor.startDate} onChange={(e) => setRegisterFor({ ...registerFor, startDate: e.target.value, endDate: e.target.value > registerFor.endDate ? e.target.value : registerFor.endDate })} className="mt-1 w-full rounded border px-3 py-2" />
                </label>
                <label className="block text-sm">{t.testEnv.usageEndDate}
                  <input type="date" min={registerFor.startDate || undefined} value={registerFor.endDate} onChange={(e) => setRegisterFor({ ...registerFor, endDate: e.target.value })} className="mt-1 w-full rounded border px-3 py-2" />
                </label>
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setRegisterFor(null)} className="rounded border px-4 py-2 text-sm">{t.common.cancel}</button>
              <button type="button" disabled={busy || !registerFor.employeeId || !registerFor.startDate || !registerFor.endDate || registerFor.endDate < registerFor.startDate} onClick={() => register(registerFor.envId, registerFor.employeeId, registerFor.startDate, registerFor.endDate)} className="rounded bg-blue-600 px-4 py-2 text-sm text-white disabled:opacity-50">{busy ? "..." : t.common.save}</button>
            </div>
          </div>
        </div>
      )}

      {historyFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[85vh] w-full max-w-3xl overflow-hidden rounded-lg border bg-white shadow-xl">
            <div className="flex items-center justify-between gap-3 border-b px-5 py-3">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">{t.testEnv.historyTitle}</h3>
                <p className="text-xs text-gray-500">{historyFor.hostName || "—"} · {historyFor.product?.name || "—"} · {historyFor.ip || "—"}</p>
              </div>
              <button type="button" onClick={() => setHistoryFor(null)} className="rounded border px-3 py-1 text-sm">{t.common.close}</button>
            </div>
            <div className="max-h-[68vh] overflow-auto p-5">
              {historyLoading ? (
                <p className="text-sm text-gray-500">...</p>
              ) : history.length === 0 ? (
                <p className="text-sm text-gray-500">{t.testEnv.historyEmpty}</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-left text-xs text-gray-600">
                    <tr>
                      <th className="px-3 py-2">{t.testEnv.historyEmployee}</th>
                      <th className="px-3 py-2">{t.testEnv.historyPeriod}</th>
                      <th className="px-3 py-2">{t.testEnv.historyRegistered}</th>
                      <th className="px-3 py-2">{t.testEnv.historyReleased}</th>
                      <th className="px-3 py-2">{t.testEnv.historyReleasedBy}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((usage) => {
                      const reason = usage.releaseReason === "CHANGED"
                        ? t.testEnv.historyChanged
                        : usage.releaseReason === "DELETED"
                          ? t.testEnv.historyDeleted
                          : usage.releaseReason;
                      return (
                        <tr key={usage.id} className="border-t align-top">
                          <td className="px-3 py-2">
                            {usage.employee.fullName}
                            <div className="text-xs text-gray-500">{usage.employee.employeeCode}</div>
                          </td>
                          <td className="whitespace-nowrap px-3 py-2 text-xs">{formatDate(usage.startDate)} → {formatDate(usage.endDate)}</td>
                          <td className="whitespace-nowrap px-3 py-2 text-xs">{formatDate(usage.registeredAt, "dd/MM/yyyy HH:mm")}</td>
                          <td className="whitespace-nowrap px-3 py-2 text-xs">
                            {usage.releasedAt ? formatDate(usage.releasedAt, "dd/MM/yyyy HH:mm") : <span className="rounded-full bg-green-100 px-2 py-0.5 text-[11px] text-green-700">{t.testEnv.historyOpen}</span>}
                          </td>
                          <td className="px-3 py-2 text-xs">
                            {usage.releasedBy?.name || "—"}
                            {reason && <div className="text-gray-500">{reason}</div>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {toast && <div className="fixed bottom-4 right-4 z-50 rounded-lg bg-gray-900 px-4 py-2 text-sm text-white shadow">{toast}</div>}
    </div>
  );
}
