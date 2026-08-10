import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/prisma";

export async function DELETE() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ success: false, error: { code: "UNAUTHORIZED" } }, { status: 401 });
  if (user.role !== "ADMIN") {
    return NextResponse.json({ success: false, error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const now = new Date();
  const result = await prisma.$transaction(async (tx) => {
    const employees = await tx.employee.findMany({ where: { isActive: true }, select: { id: true } });
    const ids = employees.map((employee) => employee.id);
    if (ids.length === 0) return 0;

    await tx.user.updateMany({ where: { employeeId: { in: ids } }, data: { isActive: false } });
    await tx.teamMember.deleteMany({ where: { employeeId: { in: ids } } });
    await tx.team.updateMany({ where: { leadId: { in: ids } }, data: { leadId: null } });
    await tx.task.updateMany({ where: { currentAssigneeId: { in: ids } }, data: { currentAssigneeId: null } });
    await tx.taskAssignmentHistory.updateMany({
      where: { employeeId: { in: ids }, assignedUntil: null },
      data: { assignedUntil: now, reason: "Employee deactivated" },
    });
    const updated = await tx.employee.updateMany({
      where: { id: { in: ids } },
      data: { isActive: false, teamId: null },
    });
    return updated.count;
  });
  return NextResponse.json({ success: true, message: `Deactivated ${result} employees; history was preserved` });
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ success: false, error: { code: "UNAUTHORIZED" } }, { status: 401 });
  if (user.role !== "ADMIN" && user.role !== "MANAGER") {
    return NextResponse.json({ success: false, error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  // Import CSV
  const body = await req.json();
  const { rows } = body; // array of [employeeCode, fullName, email, department, position]

  if (!rows || !Array.isArray(rows) || rows.length === 0 || rows.length > 5000) {
    return NextResponse.json({ success: false, error: { code: "VALIDATION_ERROR", message: "No data to import" } }, { status: 400 });
  }

  let imported = 0;
  let skipped = 0;
  const errors: string[] = [];

  const dataRows = String(rows[0]?.[0] ?? "").toLowerCase() === "employeecode" ? rows.slice(1) : rows;

  for (const row of dataRows) {
    const [employeeCode, fullName, email, department, position, teamName, activeValue] = row;
    if (!employeeCode || !fullName) {
      errors.push(`Dòng thiếu mã hoặc tên: ${row.join(",")}`);
      skipped++;
      continue;
    }
    try {
      const normalizedCode = String(employeeCode).trim();
      const normalizedTeamName = teamName ? String(teamName).trim() : "";
      const isActive = activeValue === undefined || activeValue === ""
        ? true
        : ["true", "1", "active", "đang hoạt động", "有効"].includes(String(activeValue).trim().toLowerCase());
      let teamId: string | null | undefined;
      if (teamName !== undefined) {
        if (normalizedTeamName) {
          const team = await prisma.team.findFirst({ where: { name: normalizedTeamName } })
            ?? await prisma.team.create({ data: { name: normalizedTeamName } });
          teamId = team.id;
        } else {
          teamId = null;
        }
      }
      const data = {
        fullName: String(fullName).trim(),
        email: email ? String(email).trim() : null,
        department: department ? String(department).trim() : "",
        position: position ? String(position).trim() : "",
        isActive,
        ...(teamId !== undefined ? { teamId } : {}),
      };
      const existing = await prisma.employee.findFirst({ where: { employeeCode: normalizedCode } });
      if (existing) {
        await prisma.$transaction(async (tx) => {
          await tx.employee.update({ where: { id: existing.id }, data });
          await tx.user.updateMany({ where: { employeeId: existing.id }, data: { isActive } });
          if (teamId !== undefined) {
            await tx.teamMember.deleteMany({ where: { employeeId: existing.id } });
            if (teamId) await tx.teamMember.create({ data: { teamId, employeeId: existing.id } });
          }
        });
      } else {
        await prisma.$transaction(async (tx) => {
          const created = await tx.employee.create({ data: { employeeCode: normalizedCode, ...data } });
          if (teamId) await tx.teamMember.create({ data: { teamId, employeeId: created.id } });
        });
      }
      imported++;
    } catch (e: any) {
      errors.push(`${employeeCode}: ${e.code === "P2002" ? "Mã hoặc email trùng" : e.message}`);
      skipped++;
    }
  }

  return NextResponse.json({
    success: true,
    data: { imported, skipped, errors },
    message: `Imported ${imported} employees, skipped ${skipped}`,
  });
}
