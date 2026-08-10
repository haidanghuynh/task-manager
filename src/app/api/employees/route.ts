import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ success: false, error: { code: "UNAUTHORIZED" } }, { status: 401 });

  if (user.role === "EMPLOYEE") {
    const emp = await prisma.employee.findUnique({
      where: { id: user.employeeId! },
      include: { _count: { select: { tasks: { where: { deletedAt: null } } } }, team: true },
    });
    return NextResponse.json({ success: true, data: { employees: emp ? [emp] : [], pagination: { total: emp ? 1 : 0 } } });
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
  if (user.role !== "ADMIN" && user.role !== "MANAGER") {
    return NextResponse.json({ success: false, error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const body = await req.json();
  const { employeeCode, fullName, email, department, position, teamId } = body;
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
