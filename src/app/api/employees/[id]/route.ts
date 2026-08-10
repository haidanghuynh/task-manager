import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ success: false, error: { code: "UNAUTHORIZED" } }, { status: 401 });
  const { id } = await params;

  const emp = await prisma.employee.findUnique({
    where: { id },
    include: { team: true, tasks: { where: { deletedAt: null }, include: { product: true }, orderBy: { plannedStartDate: "desc" }, take: 20 } },
  });
  if (!emp) return NextResponse.json({ success: false, error: { code: "NOT_FOUND" } }, { status: 404 });
  if (user.role === "EMPLOYEE" && user.employeeId !== emp.id) {
    return NextResponse.json({ success: false, error: { code: "FORBIDDEN" } }, { status: 403 });
  }
  return NextResponse.json({ success: true, data: emp });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ success: false, error: { code: "UNAUTHORIZED" } }, { status: 401 });
  const { id } = await params;
  if (user.role !== "ADMIN" && user.role !== "MANAGER") {
    return NextResponse.json({ success: false, error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const body = await req.json();
  const allowed = ["fullName", "email", "department", "position", "teamId", "isActive"];
  const data: any = {};
  for (const f of allowed) if (body[f] !== undefined) data[f] = body[f];

  const emp = await prisma.$transaction(async (tx) => {
    const updated = await tx.employee.update({ where: { id }, data, include: { team: true } });
    if (body.teamId !== undefined) {
      await tx.teamMember.deleteMany({ where: { employeeId: id } });
      if (body.teamId) await tx.teamMember.create({ data: { teamId: body.teamId, employeeId: id } });
    }
    return updated;
  });
  return NextResponse.json({ success: true, data: emp });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ success: false, error: { code: "UNAUTHORIZED" } }, { status: 401 });
  const { id } = await params;
  if (user.role !== "ADMIN") return NextResponse.json({ success: false, error: { code: "FORBIDDEN" } }, { status: 403 });

  const employee = await prisma.employee.findUnique({ where: { id }, select: { id: true } });
  if (!employee) return NextResponse.json({ success: false, error: { code: "NOT_FOUND" } }, { status: 404 });

  await prisma.$transaction([
    prisma.user.updateMany({ where: { employeeId: id }, data: { isActive: false } }),
    prisma.employee.update({ where: { id }, data: { isActive: false, teamId: null } }),
    prisma.teamMember.deleteMany({ where: { employeeId: id } }),
    prisma.team.updateMany({ where: { leadId: id }, data: { leadId: null } }),
    prisma.task.updateMany({ where: { currentAssigneeId: id }, data: { currentAssigneeId: null } }),
    prisma.taskAssignmentHistory.updateMany({
      where: { employeeId: id, assignedUntil: null },
      data: { assignedUntil: new Date(), reason: "Employee deactivated" },
    }),
  ]);

  return NextResponse.json({ success: true, message: "Employee deactivated; history was preserved" });
}
