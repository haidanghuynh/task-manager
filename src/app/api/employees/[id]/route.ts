import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, getVisibleEmployeeIds } from "@/lib/auth/current-user";
import { prisma } from "@/lib/prisma";
import { deleteEmployeesPermanently } from "@/services/employee.service";
import { hasPermission } from "@/lib/permissions";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ success: false, error: { code: "UNAUTHORIZED" } }, { status: 401 });
  if (!hasPermission(user, "EMPLOYEE_VIEW")) return NextResponse.json({ success: false, error: { code: "FORBIDDEN" } }, { status: 403 });
  const { id } = await params;

  const emp = await prisma.employee.findUnique({
    where: { id },
    include: { team: true, tasks: { where: { deletedAt: null }, include: { product: true }, orderBy: { plannedStartDate: "desc" }, take: 20 } },
  });
  if (!emp) return NextResponse.json({ success: false, error: { code: "NOT_FOUND" } }, { status: 404 });
  if (user.role === "EMPLOYEE") {
    const visibleEmployeeIds = await getVisibleEmployeeIds(user);
    if (!visibleEmployeeIds?.includes(emp.id)) {
      return NextResponse.json({ success: false, error: { code: "FORBIDDEN" } }, { status: 403 });
    }
  }
  return NextResponse.json({ success: true, data: emp });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ success: false, error: { code: "UNAUTHORIZED" } }, { status: 401 });
  const { id } = await params;
  if (!hasPermission(user, "EMPLOYEE_MANAGE")) {
    return NextResponse.json({ success: false, error: { code: "FORBIDDEN" } }, { status: 403 });
  }
  if (user.role === "EMPLOYEE") {
    const visibleEmployeeIds = await getVisibleEmployeeIds(user);
    if (!visibleEmployeeIds?.includes(id)) {
      return NextResponse.json({ success: false, error: { code: "FORBIDDEN" } }, { status: 403 });
    }
  }

  const body = await req.json();
  const allowed = ["employeeCode", "fullName", "email", "department", "position", "teamId", "isActive"];
  const data: any = {};
  for (const f of allowed) if (body[f] !== undefined) data[f] = body[f];
  if (user.role === "EMPLOYEE") data.teamId = user.teamId;

  if (data.employeeCode !== undefined) {
    data.employeeCode = String(data.employeeCode).trim();
    if (!/^[A-Za-z0-9._-]{1,50}$/.test(data.employeeCode)) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Mã nhân viên phải có 1-50 ký tự và chỉ gồm chữ, số, dấu chấm, gạch dưới hoặc gạch ngang.",
          },
        },
        { status: 400 },
      );
    }
  }

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

  const result = await prisma.$transaction((tx) => deleteEmployeesPermanently(tx, [id], user.id));

  return NextResponse.json({ success: true, data: result, message: "Employee permanently deleted" });
}
