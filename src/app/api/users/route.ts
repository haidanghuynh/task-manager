import { hash } from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";
import { APP_ROLES, getCurrentUser, type AppRole } from "@/lib/auth/current-user";
import { prisma } from "@/lib/prisma";

function error(status: number, code: string, message: string) {
  return NextResponse.json({ success: false, error: { code, message } }, { status });
}

export async function GET() {
  const currentUser = await getCurrentUser();
  if (!currentUser) return error(401, "UNAUTHORIZED", "Unauthorized");
  if (currentUser.role !== "ADMIN") return error(403, "FORBIDDEN", "Admin only");

  const [users, employees] = await Promise.all([
    prisma.user.findMany({
      select: {
        id: true, name: true, username: true, role: true, employeeId: true,
        isActive: true, createdAt: true,
        employee: { select: { employeeCode: true, fullName: true, isActive: true } },
      },
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
    }),
    prisma.employee.findMany({
      where: { isActive: true },
      select: { id: true, employeeCode: true, fullName: true, user: { select: { id: true } } },
      orderBy: { employeeCode: "asc" },
    }),
  ]);

  return NextResponse.json({ success: true, data: { users, employees } });
}

export async function POST(req: NextRequest) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return error(401, "UNAUTHORIZED", "Unauthorized");
  if (currentUser.role !== "ADMIN") return error(403, "FORBIDDEN", "Admin only");

  const body = await req.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const username = typeof body?.username === "string" ? body.username.trim().toLowerCase() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  const role = body?.role as AppRole;
  const employeeId = typeof body?.employeeId === "string" && body.employeeId ? body.employeeId : null;

  if (!name || !/^[a-z0-9._-]{3,50}$/.test(username)) {
    return error(400, "VALIDATION_ERROR", "Name and a valid username are required");
  }
  if (password.length < 12) return error(400, "WEAK_PASSWORD", "Password must contain at least 12 characters");
  if (!APP_ROLES.includes(role)) return error(400, "INVALID_ROLE", "Invalid role");
  if (role === "EMPLOYEE" && !employeeId) {
    return error(400, "EMPLOYEE_REQUIRED", "Employee accounts must be linked to an employee");
  }
  if (employeeId) {
    const employee = await prisma.employee.findUnique({ where: { id: employeeId }, select: { isActive: true } });
    if (!employee?.isActive) return error(400, "INVALID_EMPLOYEE", "Employee does not exist or is inactive");
  }

  try {
    const user = await prisma.user.create({
      data: { name, username, passwordHash: await hash(password, 12), role, employeeId, isActive: true },
      select: { id: true, name: true, username: true, role: true, employeeId: true, isActive: true },
    });
    return NextResponse.json({ success: true, data: user }, { status: 201 });
  } catch (caught: unknown) {
    const code = (caught as { code?: string }).code;
    if (code === "P2002") return error(409, "DUPLICATE", "Username or employee is already linked to another account");
    if (code === "P2003") return error(400, "INVALID_EMPLOYEE", "Employee does not exist");
    return error(500, "SERVER_ERROR", "Could not create account");
  }
}
