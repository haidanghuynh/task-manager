"use client";

import { useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useLang } from "@/lib/i18n";

export type RankingEntry = {
  id: string;
  name: string;
  subtitle: string;
  memberCount?: number;
  total: number;
  completed: number;
  inProgress: number;
  overdue: number;
  completionRate: number;
};

export function RankingChart({ members, teams }: { members: RankingEntry[]; teams: RankingEntry[] }) {
  const { lang } = useLang();
  const [mode, setMode] = useState<"members" | "teams">("members");
  const source = mode === "members" ? members : teams;
  const data = source.map((entry, index) => ({
    ...entry,
    rankName: `#${index + 1} ${entry.name}`,
    remaining: Math.max(0, entry.total - entry.completed),
  }));
  const text = lang === "ja" ? {
    title: "ランキング", description: "今月の完了タスク数と完了率に基づく順位",
    members: "全社員", teams: "チーム別", completed: "完了", remaining: "未完了",
    total: "合計", progress: "進行中", overdue: "期限超過", rate: "完了率",
    people: "名", empty: "ランキングデータがありません。",
  } : {
    title: "Bảng xếp hạng", description: "Xếp theo task hoàn thành và tỷ lệ hoàn thành trong tháng",
    members: "Toàn bộ thành viên", teams: "Theo từng nhóm", completed: "Hoàn thành", remaining: "Chưa hoàn thành",
    total: "Tổng", progress: "Đang làm", overdue: "Quá hạn", rate: "Tỷ lệ hoàn thành",
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
                <Tooltip />
                <Legend />
                <Bar dataKey="completed" name={text.completed} stackId="tasks" fill="#22c55e" radius={[4, 0, 0, 4]} />
                <Bar dataKey="remaining" name={text.remaining} stackId="tasks" fill="#cbd5e1" radius={[0, 4, 4, 0]} />
              </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-gray-600"><tr><th className="px-3 py-2">#</th><th className="px-3 py-2">{mode === "members" ? text.members : text.teams}</th>{mode === "teams" && <th className="px-3 py-2">{text.people}</th>}<th className="px-3 py-2">{text.total}</th><th className="px-3 py-2">{text.completed}</th><th className="px-3 py-2">{text.progress}</th><th className="px-3 py-2">{text.overdue}</th><th className="px-3 py-2">{text.rate}</th></tr></thead>
              <tbody className="divide-y">{source.map((entry, index) => <tr key={entry.id} className={index < 3 ? "bg-amber-50/40" : ""}><td className="px-3 py-2 font-bold text-gray-600">{index + 1}</td><td className="px-3 py-2"><p className="font-medium text-gray-900">{entry.name}</p><p className="text-xs text-gray-500">{entry.subtitle}</p></td>{mode === "teams" && <td className="px-3 py-2">{entry.memberCount || 0}</td>}<td className="px-3 py-2">{entry.total}</td><td className="px-3 py-2 font-semibold text-green-700">{entry.completed}</td><td className="px-3 py-2">{entry.inProgress}</td><td className="px-3 py-2 font-medium text-red-600">{entry.overdue}</td><td className="px-3 py-2"><span className="inline-flex min-w-14 justify-center rounded-full bg-blue-50 px-2 py-1 font-semibold text-blue-700">{entry.completionRate}%</span></td></tr>)}</tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
