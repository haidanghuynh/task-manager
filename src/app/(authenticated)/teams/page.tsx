"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { hasPermission, type AppPermission } from "@/lib/permissions";

const ZODIAC_ICONS = ["🌸","🐀","🐂","🐅","🐇","🐉","🐍","🐎","🐏","🐒","🐓","🐕","🐖"];

export default function TeamsPage() {
  const { data: session } = useSession();
  const user = session?.user as any;
  const [teams, setTeams] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", description: "", icon: "🐉", leadId: "" });
  const [expandedTeam, setExpandedTeam] = useState<string | null>(null);
  const [addMemberTeam, setAddMemberTeam] = useState<string | null>(null);
  const [selectedEmployee, setSelectedEmployee] = useState("");

  const isManager = hasPermission(user as { role: "ADMIN" | "MANAGER" | "EMPLOYEE"; permissions?: AppPermission[] } | undefined, "TEAM_MANAGE");

  useEffect(() => { fetchTeams(); fetchEmployees(); }, []);

  async function fetchTeams() { setLoading(true); const r = await fetch("/api/teams"); const j = await r.json(); if (j.success) setTeams(j.data); setLoading(false); }
  async function fetchEmployees() { const r = await fetch("/api/employees"); const j = await r.json(); if (j.success) setEmployees(j.data.employees); }

  async function handleCreate(e: React.FormEvent) { e.preventDefault(); await fetch("/api/teams", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) }); resetForm(); fetchTeams(); }
  async function handleUpdate(e: React.FormEvent) { e.preventDefault(); await fetch("/api/teams", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, id: editingId }) }); resetForm(); fetchTeams(); }
  async function handleDelete(id: string) { if (!confirm("Xóa nhóm này?")) return; await fetch(`/api/teams?id=${id}`, { method: "DELETE" }); fetchTeams(); }

  function resetForm() { setShowForm(false); setEditingId(null); setForm({ name: "", description: "", icon: "🐉", leadId: "" }); }
  function startEdit(team: any) { setEditingId(team.id); setForm({ name: team.name, description: team.description || "", icon: team.icon || "🐉", leadId: team.leadId || "" }); setShowForm(true); }

  async function addMember(teamId: string) { if (!selectedEmployee) return; await fetch("/api/teams/members", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ teamId, employeeId: selectedEmployee }) }); setSelectedEmployee(""); setAddMemberTeam(null); fetchTeams(); }
  async function removeMember(teamId: string, employeeId: string) { await fetch(`/api/teams/members?teamId=${teamId}&employeeId=${employeeId}`, { method: "DELETE" }); fetchTeams(); }

  const teamEmployees = (teamId: string) => employees.filter((e: any) => e.teamId === teamId);
  const availableEmployees = (teamId: string) => employees.filter((e: any) => e.isActive && e.teamId !== teamId);

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900">Nhóm / Đội</h2>
        {isManager && <button onClick={() => { resetForm(); setShowForm(!showForm); }} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">+ Tạo nhóm</button>}
      </div>

      {showForm && (
        <form onSubmit={editingId ? handleUpdate : handleCreate} className="bg-white p-4 rounded-lg border space-y-3">
          <div className="flex items-center gap-3">
            <div><label className="text-xs text-gray-500">Icon</label>
              <select value={form.icon} onChange={e => setForm({...form, icon: e.target.value})} className="w-full border rounded px-2 py-1.5 text-lg mt-1">
                {ZODIAC_ICONS.map(ico => <option key={ico} value={ico}>{ico}</option>)}
              </select>
            </div>
            <div className="flex-1"><label className="text-xs text-gray-500">Tên nhóm *</label><input required value={form.name} onChange={e => setForm({...form, name: e.target.value})} className="w-full border rounded px-3 py-1.5 text-sm mt-1" /></div>
          </div>
          <input placeholder="Mô tả" value={form.description} onChange={e => setForm({...form, description: e.target.value})} className="w-full border rounded px-3 py-1.5 text-sm" />
          <select value={form.leadId} onChange={e => setForm({...form, leadId: e.target.value})} className="w-full border rounded px-3 py-1.5 text-sm"><option value="">Chọn trưởng nhóm...</option>{employees.filter((e:any)=>e.isActive).map((e:any)=><option key={e.id} value={e.id}>{e.fullName}</option>)}</select>
          <div className="flex gap-2">
            <button type="submit" className="px-4 py-1.5 bg-blue-600 text-white rounded text-sm">{editingId ? "Cập nhật" : "Tạo"}</button>
            <button type="button" onClick={resetForm} className="px-4 py-1.5 border rounded text-sm">Hủy</button>
          </div>
        </form>
      )}

      {loading ? <div className="text-center py-12 text-gray-500">Đang tải...</div> : teams.length === 0 ? <div className="text-center py-12 text-gray-400">Chưa có nhóm nào</div> : (
        <div className="space-y-3">
          {teams.map((team) => {
            const members = teamEmployees(team.id);
            const available = availableEmployees(team.id);
            const isExpanded = expandedTeam === team.id;
            return (
              <div key={team.id} className="bg-white rounded-lg border">
                <div className="flex items-center justify-between px-4 py-3 cursor-pointer" onClick={() => setExpandedTeam(isExpanded ? null : team.id)}>
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{team.icon || "🐉"}</span>
                    <div>
                      <p className="font-semibold text-gray-900">{team.name}</p>
                      {team.description && <p className="text-xs text-gray-500">{team.description}</p>}
                      <p className="text-xs text-gray-400">Trưởng nhóm: {team.lead?.fullName || "—"} · {members.length} TV</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {isManager && (
                      <>
                        <button onClick={(e) => { e.stopPropagation(); startEdit(team); }} className="text-xs text-blue-600 hover:underline">Sửa</button>
                        <button onClick={(e) => { e.stopPropagation(); handleDelete(team.id); }} className="text-xs text-red-600 hover:underline">Xóa</button>
                      </>
                    )}
                    <span className="text-gray-400 text-xs ml-2">{isExpanded ? "▲" : "▼"}</span>
                  </div>
                </div>

                {isExpanded && (
                  <div className="border-t px-4 py-3 space-y-3">
                    {members.length === 0 && <p className="text-xs text-gray-400">Chưa có thành viên</p>}
                    {members.map((e: any) => (
                      <div key={e.id} className="flex items-center justify-between py-1.5 border-b last:border-0">
                        <span className="text-sm">{e.fullName} <span className="text-xs text-gray-400">({e.employeeCode})</span></span>
                        {isManager && <button onClick={() => removeMember(team.id, e.id)} className="text-xs text-red-600 hover:underline">Xóa</button>}
                      </div>
                    ))}
                    {isManager && (
                      <div>
                        {addMemberTeam === team.id ? (
                          <div className="flex items-center gap-2">
                            <select value={selectedEmployee} onChange={e => setSelectedEmployee(e.target.value)} className="border rounded px-2 py-1 text-xs flex-1"><option value="">Chọn...</option>{available.map((e:any)=><option key={e.id} value={e.id}>{e.fullName}</option>)}</select>
                            <button onClick={() => addMember(team.id)} disabled={!selectedEmployee} className="px-2 py-1 bg-blue-600 text-white rounded text-xs disabled:opacity-30">Thêm</button>
                            <button onClick={() => setAddMemberTeam(null)} className="px-2 py-1 border rounded text-xs">Hủy</button>
                          </div>
                        ) : (
                          <button onClick={() => setAddMemberTeam(team.id)} className="text-xs text-blue-600 hover:underline">+ Thêm thành viên</button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
