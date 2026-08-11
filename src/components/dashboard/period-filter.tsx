"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLang } from "@/lib/i18n";

export type DashboardPeriodMode = "month" | "range" | "year";

export function DashboardPeriodSummary({ label }: { label: { vi: string; ja: string } }) {
  const { lang } = useLang();
  return (
    <p data-i18n-ignore className="mt-1 text-sm text-gray-500">
      {lang === "ja" ? `集計期間：${label.ja}` : `Kỳ thống kê: ${label.vi}`}
    </p>
  );
}

type DashboardPeriodFilterProps = {
  mode: DashboardPeriodMode;
  month: string;
  year: string;
  from: string;
  to: string;
};

export function DashboardPeriodFilter({ mode: initialMode, month: initialMonth, year: initialYear, from: initialFrom, to: initialTo }: DashboardPeriodFilterProps) {
  const router = useRouter();
  const { lang } = useLang();
  const [mode, setMode] = useState<DashboardPeriodMode>(initialMode);
  const [month, setMonth] = useState(initialMonth);
  const [year, setYear] = useState(initialYear);
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);

  function applyFilter(event: React.FormEvent) {
    event.preventDefault();
    const params = new URLSearchParams({ period: mode });
    if (mode === "month") params.set("month", month);
    if (mode === "year") params.set("year", year);
    if (mode === "range") {
      params.set("from", from);
      params.set("to", to);
    }
    router.push(`/dashboard?${params.toString()}`);
  }

  const text = lang === "ja" ? {
    period: "集計期間", month: "月別", range: "期間指定", year: "年別",
    from: "開始日", to: "終了日", apply: "適用",
  } : {
    period: "Kỳ thống kê", month: "Theo tháng", range: "Khoảng thời gian", year: "Theo năm",
    from: "Từ ngày", to: "Đến ngày", apply: "Áp dụng",
  };

  return (
    <form data-i18n-ignore onSubmit={applyFilter} className="flex flex-wrap items-end gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <label className="text-sm text-gray-600">
        <span className="mb-1 block text-xs font-medium">{text.period}</span>
        <select value={mode} onChange={(event) => setMode(event.target.value as DashboardPeriodMode)} className="rounded-lg border px-3 py-2 text-sm">
          <option value="month">{text.month}</option>
          <option value="range">{text.range}</option>
          <option value="year">{text.year}</option>
        </select>
      </label>

      {mode === "month" && (
        <label className="text-sm text-gray-600">
          <span className="mb-1 block text-xs font-medium">{text.month}</span>
          <input type="month" value={month} onChange={(event) => setMonth(event.target.value)} className="rounded-lg border px-3 py-2 text-sm" required />
        </label>
      )}

      {mode === "year" && (
        <label className="text-sm text-gray-600">
          <span className="mb-1 block text-xs font-medium">{text.year}</span>
          <input type="number" min="2000" max="2100" value={year} onChange={(event) => setYear(event.target.value)} className="w-28 rounded-lg border px-3 py-2 text-sm" required />
        </label>
      )}

      {mode === "range" && (
        <>
          <label className="text-sm text-gray-600">
            <span className="mb-1 block text-xs font-medium">{text.from}</span>
            <input type="date" value={from} max={to} onChange={(event) => setFrom(event.target.value)} className="rounded-lg border px-3 py-2 text-sm" required />
          </label>
          <label className="text-sm text-gray-600">
            <span className="mb-1 block text-xs font-medium">{text.to}</span>
            <input type="date" value={to} min={from} onChange={(event) => setTo(event.target.value)} className="rounded-lg border px-3 py-2 text-sm" required />
          </label>
        </>
      )}

      <button type="submit" className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
        {text.apply}
      </button>
    </form>
  );
}
