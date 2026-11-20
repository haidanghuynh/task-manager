"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useLang } from "@/lib/i18n";
import { formatDate } from "@/lib/date";
import { hasPermission, type AppPermission } from "@/lib/permissions";

interface Employee { id: string; employeeCode: string; fullName: string; }

interface Device {
  id: string; code: string; name: string; category: string; purpose: string | null; os: string | null;
  serialNumber: string | null; location: string | null; note: string | null; status: string;
  employeeId: string | null; usageStartDate: string | null; usageEndDate: string | null;
  employee: { id: string; fullName: string; employeeCode: string } | null;
  createdBy: { id: string; name: string } | null;
}

interface DeviceUsage {
  id: string; startDate: string; endDate: string; checkedOutAt: string; returnedAt: string | null;
  returnCondition: string | null; note: string | null;
  employee: { id: string; fullName: string; employeeCode: string };
  returnedBy: { id: string; name: string } | null;
}

type StatusKey = "" | "AVAILABLE" | "IN_USE" | "MAINTENANCE" | "RETIRED";

const EXPIRY_WARNING_DAYS = 3;
const CATEGORIES = ["LAPTOP", "DESKTOP", "PHONE", "TABLET", "OTHER"] as const;
const CSV_COLUMNS = [
  "code", "name", "category", "purpose", "os", "serialNumber", "location", "note",
  "employeeCode", "usageStartDate", "usageEndDate",
] as const;

const EMPTY_FORM = { code: "", name: "", category: "LAPTOP", purpose: "", os: "", serialNumber: "", location: "", note: "" };

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

export default function TestDevicesPage() {
  const { data: session } = useSession();
  const { t } = useLang();
  const user = session?.user as { role: "ADMIN" | "MANAGER" | "EMPLOYEE"; permissions?: AppPermission[]; employeeId?: string | null } | undefined;
  const currentEmployeeId = user?.employeeId;
  const isAdmin = user?.role === "ADMIN";
  const canManage = hasPermission(user, "ENVIRONMENT_MANAGE");

  const [devices, setDevices] = useState<Device[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [expiring, setExpiring] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusKey>("");
  const [categoryFilter, setCategoryFilter] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);

  const [checkoutFor, setCheckoutFor] = useState<{ deviceId: string; employeeId: string; startDate: string; endDate: string; note: string } | null>(null);
  const [returnFor, setReturnFor] = useState<{ deviceId: string; returnCondition: string; note: string } | null>(null);
  const [historyFor, setHistoryFor] = useState<Device | null>(null);
  const [history, setHistory] = useState<DeviceUsage[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(id);
  }, [search]);

  const fetchExpiring = useCallback(async () => {
    try {
      const res = await fetch(`/api/test-devices/expiring?days=${EXPIRY_WARNING_DAYS}`, { cache: "no-store" });
      const json = await res.json();
      if (json.success) setExpiring(json.data);
    } catch {
      // Cảnh báo chỉ là phụ trợ.
    }
  }, []);

  const fetchDevices = useCallback(async () => {
    const params = new URLSearchParams();
    if (statusFilter) params.set("status", statusFilter);
    if (categoryFilter) params.set("category", categoryFilter);
    if (debouncedSearch.trim()) params.set("search", debouncedSearch.trim());
    try {
      const res = await fetch(`/api/test-devices?${params.toString()}`, { cache: "no-store" });
      const json = await res.json();
      if (!json.success) throw new Error();
      setDevices(json.data);
      setError("");
      void fetchExpiring();
    } catch {
      setError(t.testDevice.loadError);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, categoryFilter, debouncedSearch, fetchExpiring, t.testDevice.loadError]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async fetch (setState after await)
    fetchDevices();
  }, [fetchDevices]);

  useEffect(() => {
    fetch("/api/employees?pageSize=100")
      .then((res) => res.json())
      .then((json) => { if (json.success) setEmployees(json.data.employees as Employee[]); })
      .catch(() => undefined);
  }, []);

  function showToast(message: string) {
    setToast(message);
    setTimeout(() => setToast(null), 2400);
  }

  const statusText = (status: string) => status === "IN_USE"
    ? t.testDevice.statusInUse
    : status === "MAINTENANCE"
      ? t.testDevice.statusMaintenance
      : status === "RETIRED"
        ? t.testDevice.statusRetired
        : t.testDevice.statusAvailable;

  const categoryText = (category: string) => category === "DESKTOP"
    ? t.testDevice.categoryDesktop
    : category === "PHONE"
      ? t.testDevice.categoryPhone
      : category === "TABLET"
        ? t.testDevice.categoryTablet
        : category === "OTHER"
          ? t.testDevice.categoryOther
          : t.testDevice.categoryLaptop;

  function openCreate() {
    setEditingId(null);
    setForm({ ...EMPTY_FORM });
    setShowForm(true);
  }

  function openEdit(device: Device) {
    setEditingId(device.id);
    setForm({
      code: device.code,
      name: device.name,
      category: device.category,
      purpose: device.purpose || "",
      os: device.os || "",
      serialNumber: device.serialNumber || "",
      location: device.location || "",
      note: device.note || "",
    });
    setShowForm(true);
  }

  async function submitForm(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      const url = editingId ? `/api/test-devices/${editingId}` : "/api/test-devices";
      const body = editingId ? { ...form, code: undefined } : form;
      const res = await fetch(url, {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!json.success) {
        alert(json.error?.code === "DUPLICATE" ? t.testDevice.duplicateCode : (json.error?.message || t.testDevice.loadError));
        return;
      }
      setShowForm(false);
      setEditingId(null);
      setForm({ ...EMPTY_FORM });
      await fetchDevices();
    } catch {
      alert(t.testDevice.loadError);
    } finally {
      setSaving(false);
    }
  }

  async function remove(device: Device) {
    if (!confirm(t.testDevice.confirmDelete)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/test-devices/${device.id}`, { method: "DELETE" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(json.error?.code === "IN_USE" ? t.testDevice.inUse : t.testDevice.loadError);
        return;
      }
      await fetchDevices();
    } finally {
      setBusy(false);
    }
  }

  function startCheckout(device: Device) {
    setCheckoutFor({
      deviceId: device.id,
      employeeId: currentEmployeeId || "",
      startDate: toInputDate(new Date()),
      endDate: inputDateAfter(7),
      note: "",
    });
  }

  async function checkout() {
    if (!checkoutFor) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/test-devices/${checkoutFor.deviceId}/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: checkoutFor.employeeId || undefined,
          startDate: checkoutFor.startDate,
          endDate: checkoutFor.endDate,
          note: checkoutFor.note,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(json.error?.code === "NO_EMPLOYEE" ? t.testDevice.noEmployee : (json.error?.message || t.testDevice.checkoutFailed));
        return;
      }
      setCheckoutFor(null);
      await fetchDevices();
    } finally {
      setBusy(false);
    }
  }

  function startReturn(device: Device) {
    setReturnFor({ deviceId: device.id, returnCondition: "OK", note: "" });
  }

  async function returnDevice() {
    if (!returnFor) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/test-devices/${returnFor.deviceId}/return`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ returnCondition: returnFor.returnCondition, note: returnFor.note }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(json.error?.message || t.testDevice.returnFailed);
        return;
      }
      setReturnFor(null);
      await fetchDevices();
    } finally {
      setBusy(false);
    }
  }

  async function openHistory(device: Device) {
    setHistoryFor(device);
    setHistory([]);
    setHistoryLoading(true);
    try {
      const res = await fetch(`/api/test-devices/${device.id}/usages`, { cache: "no-store" });
      const json = await res.json();
      if (json.success) setHistory(json.data);
    } catch {
      showToast(t.testDevice.historyFailed);
    } finally {
      setHistoryLoading(false);
    }
  }

  async function importCsv(file: File) {
    const content = (await file.text()).replace(/^\uFEFF/, "");
    const rows = content.split(/\r?\n/).filter((line) => line.trim()).map(parseCsvLine);
    if (rows.length === 0) {
      alert(t.testDevice.importFailed);
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/test-devices/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) {
        alert(json.error?.message || t.testDevice.importFailed);
        return;
      }
      const { imported, skipped, errors } = json.data as { imported: number; skipped: number; errors: string[] };
      await fetchDevices();
      const detail = errors?.length ? `\n\n${errors.slice(0, 5).join("\n")}${errors.length > 5 ? "\n..." : ""}` : "";
      alert(`${t.testDevice.importSuccess} ${imported} ${t.testDevice.importRows}, ${t.testDevice.importSkipped} ${skipped} ${t.testDevice.importRows}.${detail}`);
    } catch {
      alert(t.testDevice.importFailed);
    } finally {
      setBusy(false);
    }
  }

  function exportCsv() {
    const lines = [CSV_COLUMNS.join(",")];
    for (const device of devices) {
      lines.push([
        device.code, device.name, device.category, device.purpose, device.os, device.serialNumber,
        device.location, device.note, device.employee?.employeeCode,
        device.usageStartDate ? device.usageStartDate.slice(0, 10) : "",
        device.usageEndDate ? device.usageEndDate.slice(0, 10) : "",
      ].map(csvCell).join(","));
    }
    const blob = new Blob([`\uFEFF${lines.join("\r\n")}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `test-devices-${toInputDate(new Date())}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">{t.common.testDevices}</h2>
          <p className="text-sm text-gray-500">{t.testDevice.statusAvailable} / {t.testDevice.statusInUse} / {t.testDevice.statusMaintenance}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canManage && (
            <label className="cursor-pointer rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700">
              📥 {t.testDevice.importCsv}
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
          <button type="button" onClick={exportCsv} className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700">📤 {t.testDevice.exportCsv}</button>
          {canManage && <button type="button" onClick={openCreate} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">+ {t.testDevice.add}</button>}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t.testDevice.searchPlaceholder}
          className="min-w-52 flex-1 rounded-lg border px-3 py-2 text-sm"
        />
        <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} className="rounded-lg border px-3 py-2 text-sm">
          <option value="">{t.testDevice.allCategories}</option>
          {CATEGORIES.map((category) => <option key={category} value={category}>{categoryText(category)}</option>)}
        </select>
        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as StatusKey)} className="rounded-lg border px-3 py-2 text-sm">
          <option value="">{t.testDevice.allStatuses}</option>
          {(["AVAILABLE", "IN_USE", "MAINTENANCE", "RETIRED"] as const).map((status) => <option key={status} value={status}>{statusText(status)}</option>)}
        </select>
      </div>

      {expiring.length > 0 && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-semibold">{t.testDevice.expiringTitle} ({expiring.length})</p>
            <p className="text-xs">{t.testDevice.expiringHint}</p>
          </div>
          <ul className="mt-2 space-y-1">
            {expiring.slice(0, 5).map((device) => {
              const left = daysLeftUntil(device.usageEndDate);
              return (
                <li key={device.id} className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${left !== null && left < 0 ? "bg-red-100 text-red-700" : "bg-amber-200 text-amber-900"}`}>
                    {left !== null && left < 0 ? `${t.testDevice.overdueBy} ${Math.abs(left)} ${t.testDevice.dayUnit}` : `${t.testDevice.expiringIn} ${left ?? 0} ${t.testDevice.dayUnit}`}
                  </span>
                  <span className="font-medium">{device.name} ({device.code})</span>
                  <span className="text-xs text-amber-800">
                    {device.employee?.fullName || "—"}
                    {device.employeeId === currentEmployeeId && <span className="ml-1 text-blue-600">{t.testDevice.you}</span>}
                    {" · "}{device.usageEndDate ? formatDate(device.usageEndDate, "dd/MM/yyyy") : "—"}
                  </span>
                  {(device.employeeId === currentEmployeeId || canManage) && (
                    <button type="button" disabled={busy} onClick={() => startReturn(device)} className="rounded border border-amber-500 px-2 py-0.5 text-xs font-medium text-amber-800 hover:bg-amber-100 disabled:opacity-50">{t.testDevice.return}</button>
                  )}
                </li>
              );
            })}
          </ul>
          {expiring.length > 5 && <p className="mt-1 text-xs">+{expiring.length - 5} {t.testDevice.moreItems}</p>}
        </div>
      )}

      {error && <div className="rounded border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>}

      {showForm && canManage && (
        <form onSubmit={submitForm} className="grid gap-4 rounded-lg border bg-white p-5 md:grid-cols-3">
          <h3 className="text-lg font-semibold text-gray-900 md:col-span-3">{editingId ? t.common.edit : t.testDevice.add}</h3>
          <label className="text-sm">{t.testDevice.code} *
            <input required disabled={Boolean(editingId)} value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value.toUpperCase() })} className="mt-1 w-full rounded border px-3 py-2 uppercase disabled:bg-gray-100" />
          </label>
          <label className="text-sm">{t.testDevice.name} *
            <input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className="mt-1 w-full rounded border px-3 py-2" />
          </label>
          <label className="text-sm">{t.testDevice.category}
            <select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} className="mt-1 w-full rounded border px-3 py-2">
              {CATEGORIES.map((category) => <option key={category} value={category}>{categoryText(category)}</option>)}
            </select>
          </label>
          <label className="text-sm">{t.testDevice.purpose}
            <input value={form.purpose} onChange={(event) => setForm({ ...form, purpose: event.target.value })} className="mt-1 w-full rounded border px-3 py-2" />
          </label>
          <label className="text-sm">{t.testDevice.osLabel}
            <input value={form.os} onChange={(event) => setForm({ ...form, os: event.target.value })} className="mt-1 w-full rounded border px-3 py-2" />
          </label>
          <label className="text-sm">{t.testDevice.serialNumber}
            <input value={form.serialNumber} onChange={(event) => setForm({ ...form, serialNumber: event.target.value })} className="mt-1 w-full rounded border px-3 py-2 font-mono" />
          </label>
          <label className="text-sm">{t.testDevice.location}
            <input value={form.location} onChange={(event) => setForm({ ...form, location: event.target.value })} className="mt-1 w-full rounded border px-3 py-2" />
          </label>
          <label className="text-sm md:col-span-2">{t.testDevice.note}
            <input value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} className="mt-1 w-full rounded border px-3 py-2" />
          </label>
          <div className="flex items-end gap-2 md:col-span-3">
            <button type="submit" disabled={saving} className="rounded bg-blue-600 px-4 py-2 text-sm text-white disabled:opacity-50">{saving ? "..." : t.common.save}</button>
            <button type="button" onClick={() => { setShowForm(false); setEditingId(null); }} className="rounded border px-4 py-2 text-sm">{t.common.cancel}</button>
          </div>
        </form>
      )}

      {loading ? (
        <p className="p-8 text-center text-sm text-gray-500">...</p>
      ) : devices.length === 0 ? (
        <p className="p-8 text-center text-sm text-gray-500">{t.testDevice.empty}</p>
      ) : (
        <div className="overflow-hidden rounded-lg border bg-white">
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-gray-600">
                <tr>
                  <th className="px-4 py-3">{t.testDevice.name}</th>
                  <th className="px-4 py-3">{t.testDevice.category}</th>
                  <th className="px-4 py-3">{t.testDevice.serialNumber} / {t.testDevice.location}</th>
                  <th className="px-4 py-3">{t.testDevice.userName}</th>
                  <th className="px-4 py-3">{t.testDevice.startDate} / {t.testDevice.endDate}</th>
                  <th className="px-4 py-3">{t.testDevice.status}</th>
                  <th className="px-4 py-3">{t.testDevice.actions}</th>
                </tr>
              </thead>
              <tbody>
                {devices.map((device) => {
                  const expiryLeft = device.employeeId ? daysLeftUntil(device.usageEndDate) : null;
                  const statusClass = device.status === "IN_USE"
                    ? "bg-orange-100 text-orange-700"
                    : device.status === "MAINTENANCE"
                      ? "bg-amber-100 text-amber-700"
                      : device.status === "RETIRED"
                        ? "bg-gray-100 text-gray-500"
                        : "bg-green-100 text-green-700";
                  return (
                    <tr key={device.id} className="border-t align-top hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div className="font-semibold text-gray-900">{device.name}</div>
                        <div className="text-xs text-gray-500">{device.code}{device.purpose ? ` · ${device.purpose}` : ""}</div>
                      </td>
                      <td className="px-4 py-3 text-xs">
                        <div>{categoryText(device.category)}</div>
                        <div className="text-gray-500">{device.os || "—"}</div>
                      </td>
                      <td className="px-4 py-3 text-xs">
                        <div className="font-mono">{device.serialNumber || "—"}</div>
                        <div className="text-gray-500">{device.location || "—"}</div>
                      </td>
                      <td className="px-4 py-3">
                        {device.employee
                          ? <span>{device.employee.fullName}{device.employeeId === currentEmployeeId && <span className="ml-1 text-xs text-blue-600">{t.testDevice.you}</span>}</span>
                          : "—"}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs">
                        <div>
                          {device.usageStartDate ? formatDate(device.usageStartDate, "dd/MM/yyyy") : "—"}
                          {" → "}
                          {device.usageEndDate ? formatDate(device.usageEndDate, "dd/MM/yyyy") : "—"}
                        </div>
                        {expiryLeft !== null && expiryLeft <= EXPIRY_WARNING_DAYS && (
                          <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[11px] ${expiryLeft < 0 ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>
                            {expiryLeft < 0 ? `${t.testDevice.overdueBy} ${Math.abs(expiryLeft)} ${t.testDevice.dayUnit}` : `${t.testDevice.expiringIn} ${expiryLeft} ${t.testDevice.dayUnit}`}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2 py-0.5 text-xs ${statusClass}`}>{statusText(device.status)}</span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <div className="flex flex-wrap items-center gap-2">
                          {device.status === "AVAILABLE" && !device.employeeId && (
                            <button type="button" disabled={busy} onClick={() => startCheckout(device)} className="rounded-lg border border-blue-500 px-3 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50 disabled:opacity-50">{t.testDevice.checkout}</button>
                          )}
                          {device.employeeId && (device.employeeId === currentEmployeeId || canManage) && (
                            <button type="button" disabled={busy} onClick={() => startReturn(device)} className="rounded-lg border border-orange-400 px-3 py-1 text-xs font-medium text-orange-600 hover:bg-orange-50 disabled:opacity-50">{t.testDevice.return}</button>
                          )}
                          <button type="button" onClick={() => openHistory(device)} className="text-xs font-medium text-gray-600 hover:text-blue-600">{t.testDevice.history}</button>
                          {canManage && <button type="button" onClick={() => openEdit(device)} className="text-xs text-blue-600 hover:underline">{t.common.edit}</button>}
                          {isAdmin && <button type="button" onClick={() => remove(device)} className="text-xs text-red-600 hover:underline">{t.common.delete}</button>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="border-t px-4 py-2 text-sm text-gray-500">{t.testDevice.showing} {devices.length}</div>
        </div>
      )}

      {checkoutFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-lg border bg-white p-5 shadow-xl">
            <h3 className="mb-3 text-lg font-semibold text-gray-900">{t.testDevice.checkout}</h3>
            <div className="space-y-3">
              <label className="block text-sm">{t.testDevice.userName}
                <select
                  value={checkoutFor.employeeId}
                  onChange={(event) => setCheckoutFor({ ...checkoutFor, employeeId: event.target.value })}
                  disabled={Boolean(currentEmployeeId) && !canManage}
                  className="mt-1 w-full rounded border px-3 py-2 disabled:bg-gray-100"
                >
                  <option value="">—</option>
                  {employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.fullName} ({employee.employeeCode})</option>)}
                </select>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-sm">{t.testDevice.startDate}
                  <input
                    type="date"
                    value={checkoutFor.startDate}
                    onChange={(event) => setCheckoutFor({ ...checkoutFor, startDate: event.target.value, endDate: event.target.value > checkoutFor.endDate ? event.target.value : checkoutFor.endDate })}
                    className="mt-1 w-full rounded border px-3 py-2"
                  />
                </label>
                <label className="block text-sm">{t.testDevice.endDate}
                  <input
                    type="date"
                    min={checkoutFor.startDate || undefined}
                    value={checkoutFor.endDate}
                    onChange={(event) => setCheckoutFor({ ...checkoutFor, endDate: event.target.value })}
                    className="mt-1 w-full rounded border px-3 py-2"
                  />
                </label>
              </div>
              <label className="block text-sm">{t.testDevice.note}
                <input value={checkoutFor.note} onChange={(event) => setCheckoutFor({ ...checkoutFor, note: event.target.value })} className="mt-1 w-full rounded border px-3 py-2" />
              </label>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setCheckoutFor(null)} className="rounded border px-4 py-2 text-sm">{t.common.cancel}</button>
              <button
                type="button"
                disabled={busy || !checkoutFor.employeeId || !checkoutFor.startDate || !checkoutFor.endDate || checkoutFor.endDate < checkoutFor.startDate}
                onClick={checkout}
                className="rounded bg-blue-600 px-4 py-2 text-sm text-white disabled:opacity-50"
              >
                {busy ? "..." : t.common.save}
              </button>
            </div>
          </div>
        </div>
      )}

      {returnFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-lg border bg-white p-5 shadow-xl">
            <h3 className="mb-3 text-lg font-semibold text-gray-900">{t.testDevice.return}</h3>
            <div className="space-y-3">
              <label className="block text-sm">{t.testDevice.condition}
                <select value={returnFor.returnCondition} onChange={(event) => setReturnFor({ ...returnFor, returnCondition: event.target.value })} className="mt-1 w-full rounded border px-3 py-2">
                  <option value="OK">{t.testDevice.conditionOk}</option>
                  <option value="DAMAGED">{t.testDevice.conditionDamaged}</option>
                  <option value="LOST">{t.testDevice.conditionLost}</option>
                </select>
              </label>
              <label className="block text-sm">{t.testDevice.note}
                <input value={returnFor.note} onChange={(event) => setReturnFor({ ...returnFor, note: event.target.value })} className="mt-1 w-full rounded border px-3 py-2" />
              </label>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setReturnFor(null)} className="rounded border px-4 py-2 text-sm">{t.common.cancel}</button>
              <button type="button" disabled={busy} onClick={returnDevice} className="rounded bg-orange-600 px-4 py-2 text-sm text-white disabled:opacity-50">{busy ? "..." : t.common.save}</button>
            </div>
          </div>
        </div>
      )}

      {historyFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[85vh] w-full max-w-4xl overflow-hidden rounded-lg border bg-white shadow-xl">
            <div className="flex items-center justify-between gap-3 border-b px-5 py-3">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">{t.testDevice.history}</h3>
                <p className="text-xs text-gray-500">{historyFor.name} · {historyFor.code} · {historyFor.serialNumber || "—"}</p>
              </div>
              <button type="button" onClick={() => setHistoryFor(null)} className="rounded border px-3 py-1 text-sm">{t.common.close}</button>
            </div>
            <div className="max-h-[68vh] overflow-auto p-5">
              {historyLoading ? (
                <p className="text-sm text-gray-500">...</p>
              ) : history.length === 0 ? (
                <p className="text-sm text-gray-500">{t.testDevice.historyEmpty}</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-left text-xs text-gray-600">
                    <tr>
                      <th className="px-3 py-2">{t.testDevice.userName}</th>
                      <th className="px-3 py-2">{t.testDevice.startDate} / {t.testDevice.endDate}</th>
                      <th className="px-3 py-2">{t.testDevice.checkedOutAt}</th>
                      <th className="px-3 py-2">{t.testDevice.returnedAt}</th>
                      <th className="px-3 py-2">{t.testDevice.returnedBy}</th>
                      <th className="px-3 py-2">{t.testDevice.condition}</th>
                      <th className="px-3 py-2">{t.testDevice.note}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((usage) => {
                      const condition = usage.returnCondition === "DAMAGED"
                        ? t.testDevice.conditionDamaged
                        : usage.returnCondition === "LOST"
                          ? t.testDevice.conditionLost
                          : usage.returnCondition === "OK"
                            ? t.testDevice.conditionOk
                            : "—";
                      return (
                        <tr key={usage.id} className="border-t align-top">
                          <td className="px-3 py-2">
                            {usage.employee.fullName}
                            <div className="text-xs text-gray-500">{usage.employee.employeeCode}</div>
                          </td>
                          <td className="whitespace-nowrap px-3 py-2 text-xs">{formatDate(usage.startDate)} → {formatDate(usage.endDate)}</td>
                          <td className="whitespace-nowrap px-3 py-2 text-xs">{formatDate(usage.checkedOutAt, "dd/MM/yyyy HH:mm")}</td>
                          <td className="whitespace-nowrap px-3 py-2 text-xs">
                            {usage.returnedAt ? formatDate(usage.returnedAt, "dd/MM/yyyy HH:mm") : <span className="rounded-full bg-green-100 px-2 py-0.5 text-[11px] text-green-700">{t.testDevice.historyOpen}</span>}
                          </td>
                          <td className="px-3 py-2 text-xs">{usage.returnedBy?.name || "—"}</td>
                          <td className="px-3 py-2 text-xs">{condition}</td>
                          <td className="px-3 py-2 text-xs">{usage.note || "—"}</td>
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
