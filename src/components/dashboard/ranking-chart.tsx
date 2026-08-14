"use client";

import { useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import Link from "next/link";
import { useLang } from "@/lib/i18n";

export type RankingEntry = {
  id: string;
  name: string;
  subtitle: string;
  memberCount?: number;
  total: number;
  completed: number;
  planned: number;
  inProgress: number;
  waiting: number;
  cancelled: number;
  overdue: number;
  completionRate: number;
};

type RankingChartProps = {
  members: RankingEntry[];
  teams: RankingEntry[];
  periodLabel: { vi: string; ja: string };
  range: { from: string; to: string };
  includeDaily: boolean;
};

type RankingTooltipProps = {
  active?: boolean;
  payload?: Array<{ payload: RankingEntry & { rankName: string; remaining: number } }>;
  labels: {
    total: string;
    completed: string;
    progress: string;
    waiting: string;
    planned: string;
    cancelled: string;
    overdue: string;
    rate: string;
  };
};

function RankingTooltip({ active, payload, labels }: RankingTooltipProps) {
  const entry = payload?.[0]?.payload;
  if (!active || !entry) return null;
  return (
    <div data-i18n-ignore className="min-w-52 rounded-lg border bg-white p-3 text-xs shadow-lg">
      <p className="mb-2 font-semibold text-gray-900">{entry.name}</p>
      <div className="space-y-1 text-gray-600">
        <p className="flex justify-between gap-5"><span>{labels.total}</span><strong>{entry.total}</strong></p>
        <p className="flex justify-between gap-5"><span>{labels.completed}</span><strong className="text-green-700">{entry.completed}</strong></p>
        <p className="flex justify-between gap-5"><span>{labels.progress}</span><strong>{entry.inProgress}</strong></p>
        <p className="flex justify-between gap-5"><span>{labels.waiting}</span><strong>{entry.waiting}</strong></p>
        <p className="flex justify-between gap-5"><span>{labels.planned}</span><strong>{entry.planned}</strong></p>
        <p className="flex justify-between gap-5"><span>{labels.cancelled}</span><strong>{entry.cancelled}</strong></p>
        <p className="flex justify-between gap-5"><span>{labels.overdue}</span><strong className="text-red-600">{entry.overdue}</strong></p>
        <p className="flex justify-between gap-5 border-t pt-1"><span>{labels.rate}</span><strong>{entry.completionRate}%</strong></p>
      </div>
    </div>
  );
}

export function RankingChart({ members, teams, periodLabel, range, includeDaily }: RankingChartProps) {
  const { lang } = useLang();
  const [mode, setMode] = useState<"members" | "teams">("members");
  const source = mode === "members" ? members : teams;
  const data = source.map((entry, index) => ({
    ...entry,
    rankName: `#${index + 1} ${entry.name}`,
    remaining: Math.max(0, entry.total - entry.completed - entry.cancelled),
  }));
  const text = lang === "ja" ? {
    title: "ランキング", description: `${periodLabel.ja}の${includeDaily ? "全業務" : "製品タスク"}集計`,
    members: "全社員", teams: "チーム別", completed: "完了", remaining: "未完了",
    total: "合計", planned: "未着手", progress: "進行中", waiting: "保留中", cancelled: "キャンセル済み", overdue: "期限超過", rate: "完了率",
    people: "名", empty: "ランキングデータがありません。",
  } : {
    title: "Bảng xếp hạng", description: `Thống kê ${includeDaily ? "toàn bộ công việc" : "task sản phẩm"} ${periodLabel.vi}`,
    members: "Toàn bộ thành viên", teams: "Theo từng nhóm", completed: "Hoàn thành", remaining: "Chưa hoàn thành",
    total: "Tổng", planned: "Chưa bắt đầu", progress: "Đang làm", waiting: "Đang chờ", cancelled: "Đã hủy", overdue: "Quá hạn", rate: "Tỷ lệ hoàn thành",
    people: "thành viên", empty: "Chưa có dữ liệu xếp hạng.",
  };

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">{text.title}</h3>
          <p className="mt-1 text-sm text-gray-500">{text.description}</p>
        </div>
        <div className="flex rounded-lg bg-gray-100 p-1 text-sm">
          <button onClick={() => setMode("members")} className={`rounded-md px-3 py-1.5 ${mode === "members" ? "bg-white font-medium text-blue-700 shadow-sm" : "text-gray-600"}`}>{text.members}</button>
          <button onClick={() => setMode("teams")} className={`rounded-md px-3 py-1.5 ${mode === "teams" ? "bg-white font-medium text-blue-700 shadow-sm" : "text-gray-600"}`}>{text.teams}</button>
        </div>
      </div>

      {data.length === 0 ? <div className="py-12 text-center text-sm text-gray-500">{text.empty}</div> : (
        <div className="space-y-5">
          <div className="overflow-x-auto">
            <div className="min-w-[680px]" style={{ height: Math.max(280, data.length * 48) }}>
              <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} layout="vertical" margin={{ top: 5, right: 25, left: 35, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" allowDecimals={false} />
                <YAxis type="category" dataKey="rankName" width={150} tick={{ fontSize: 12 }} />
                <Tooltip content={<RankingTooltip labels={text} />} />
                <Legend />
                <Bar dataKey="completed" name={text.completed} stackId="tasks" fill="#22c55e" radius={[4, 0, 0, 4]} />
                <Bar dataKey="remaining" name={text.remaining} stackId="tasks" fill="#cbd5e1" radius={[0, 4, 4, 0]} />
                <Bar dataKey="cancelled" name={text.cancelled} stackId="tasks" fill="#94a3b8" radius={[0, 4, 4, 0]} />
              </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-gray-600"><tr><th className="px-3 py-2">#</th><th className="px-3 py-2">{mode === "members" ? text.members : text.teams}</th>{mode === "teams" && <th className="px-3 py-2">{text.people}</th>}<th className="px-3 py-2">{text.total}</th><th className="px-3 py-2">{text.completed}</th><th className="px-3 py-2">{text.progress}</th><th className="px-3 py-2">{text.cancelled}</th><th className="px-3 py-2">{text.overdue}</th><th className="px-3 py-2">{text.rate}</th></tr></thead>
              <tbody className="divide-y">{source.map((entry, index) => <tr key={entry.id} className={index < 3 ? "bg-amber-50/40" : ""}><td className="px-3 py-2 font-bold text-gray-600">{index + 1}</td><td className="px-3 py-2">{mode === "members" ? <Link href={`/tasks?employee=${encodeURIComponent(entry.id)}&startDate=${range.from}&endDate=${range.to}&view=list${includeDaily ? "" : "&workType=PRODUCT"}`} className="font-medium text-blue-700 hover:underline">{entry.name}</Link> : <p className="font-medium text-gray-900">{entry.name}</p>}<p className="text-xs text-gray-500">{entry.subtitle}</p></td>{mode === "teams" && <td className="px-3 py-2">{entry.memberCount || 0}</td>}<td className="px-3 py-2">{entry.total}</td><td className="px-3 py-2 font-semibold text-green-700">{entry.completed}</td><td className="px-3 py-2">{entry.inProgress}</td><td className="px-3 py-2">{entry.cancelled}</td><td className="px-3 py-2 font-medium text-red-600">{entry.overdue}</td><td className="px-3 py-2"><span className="inline-flex min-w-14 justify-center rounded-full bg-blue-50 px-2 py-1 font-semibold text-blue-700">{entry.completionRate}%</span></td></tr>)}</tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
