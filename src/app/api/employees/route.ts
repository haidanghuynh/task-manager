import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, getVisibleEmployeeIds } from "@/lib/auth/current-user";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/lib/permissions";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ success: false, error: { code: "UNAUTHORIZED" } }, { status: 401 });
  if (!hasPermission(user, "EMPLOYEE_VIEW")) return NextResponse.json({ success: false, error: { code: "FORBIDDEN" } }, { status: 403 });

  if (user.role === "EMPLOYEE") {
    const visibleEmployeeIds = await getVisibleEmployeeIds(user);
    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search") || "";
    const where = {
      id: { in: visibleEmployeeIds ?? [] },
      isActive: true,
      ...(search ? { OR: [{ fullName: { contains: search } }, { employeeCode: { contains: search } }] } : {}),
    };
    const employees = await prisma.employee.findMany({
      where,
      include: { _count: { select: { tasks: { where: { deletedAt: null } } } }, team: true },
      orderBy: { employeeCode: "asc" },
    });
    return NextResponse.json({
      success: true,
      data: {
        employees,
        pagination: { page: 1, pageSize: employees.length, total: employees.length, totalPages: 1 },
      },
    });
  }

  const { searchParams } = new URL(req.url);
  const search = searchParams.get("search") || "";
  const department = searchParams.get("department") || "";
  const teamId = searchParams.get("teamId") || "";
  const isActive = searchParams.get("isActive");
  const page = parseInt(searchParams.get("page") || "1");
  const pageSize = parseInt(searchParams.get("pageSize") || "20");

  const where: any = {};
  if (search) where.OR = [{ fullName: { contains: search } }, { employeeCode: { contains: search } }];
  if (department) where.department = department;
  if (teamId) where.teamId = teamId;
  if (isActive !== null && isActive !== "") where.isActive = isActive === "true";

  const [employees, total] = await Promise.all([
    prisma.employee.findMany({
      where,
      include: { _count: { select: { tasks: { where: { deletedAt: null, status: { notIn: ["COMPLETED", "CANCELLED"] } } } } }, team: true },
      orderBy: { employeeCode: "asc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.employee.count({ where }),
  ]);

  return NextResponse.json({ success: true, data: { employees, pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } } });
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ success: false, error: { code: "UNAUTHORIZED" } }, { status: 401 });
  if (!hasPermission(user, "EMPLOYEE_MANAGE")) {
    return NextResponse.json({ success: false, error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const body = await req.json();
  const { employeeCode, fullName, email, department, position } = body;
  const teamId = user.role === "EMPLOYEE" ? user.teamId : body.teamId;
  if (user.role === "EMPLOYEE" && !teamId) {
    return NextResponse.json({ success: false, error: { code: "FORBIDDEN" } }, { status: 403 });
  }
  if (!employeeCode || !fullName) {
    return NextResponse.json({ success: false, error: { code: "VALIDATION_ERROR", message: "Employee code and name required" } }, { status: 400 });
  }

  try {
    const emp = await prisma.$transaction(async (tx) => {
      const created = await tx.employee.create({
        data: { employeeCode, fullName, email, department: department || "", position: position || "", teamId: teamId || null },
        include: { team: true },
      });
      if (teamId) await tx.teamMember.create({ data: { teamId, employeeId: created.id } });
      return created;
    });
    return NextResponse.json({ success: true, data: emp }, { status: 201 });
  } catch (e: any) {
    if (e.code === "P2002") return NextResponse.json({ success: false, error: { code: "DUPLICATE", message: "Employee code or email already exists" } }, { status: 409 });
    return NextResponse.json({ success: false, error: { code: "SERVER_ERROR", message: e.message } }, { status: 500 });
  }
}
