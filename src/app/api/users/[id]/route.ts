import { hash } from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";
import { APP_ROLES, getCurrentUser, type AppRole } from "@/lib/auth/current-user";
import { prisma } from "@/lib/prisma";

function error(status: number, code: string, message: string) {
  return NextResponse.json({ success: false, error: { code, message } }, { status });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return error(401, "UNAUTHORIZED", "Unauthorized");
  if (currentUser.role !== "ADMIN") return error(403, "FORBIDDEN", "Admin only");

  const { id } = await params;
  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) return error(404, "NOT_FOUND", "Account not found");

  const body = await req.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : target.name;
  const usernameWasProvided = typeof body?.username === "string";
  const username = usernameWasProvided ? body.username.trim().toLowerCase() : target.username;
  const role = (typeof body?.role === "string" ? body.role : target.role) as AppRole;
  const isActive = typeof body?.isActive === "boolean" ? body.isActive : target.isActive;
  const employeeId = body?.employeeId === null
    ? null
    : typeof body?.employeeId === "string" && body.employeeId ? body.employeeId : target.employeeId;
  const password = typeof body?.password === "string" ? body.password : "";

  if (!name || (usernameWasProvided && !/^[a-z0-9._-]{3,50}$/.test(username))) {
    return error(400, "VALIDATION_ERROR", "Name and a valid username are required");
  }
  if (!APP_ROLES.includes(role)) return error(400, "INVALID_ROLE", "Invalid role");
  if (role === "EMPLOYEE" && !employeeId) {
    return error(400, "EMPLOYEE_REQUIRED", "Employee accounts must be linked to an employee");
  }
  if (employeeId) {
    const employee = await prisma.employee.findUnique({ where: { id: employeeId }, select: { isActive: true } });
    if (!employee?.isActive) return error(400, "INVALID_EMPLOYEE", "Employee does not exist or is inactive");
  }
  if (password && password.length < 8) return error(400, "WEAK_PASSWORD", "Password must contain at least 8 characters");
  if (id === currentUser.id && (!isActive || role !== "ADMIN")) {
    return error(400, "SELF_LOCKOUT", "You cannot disable or remove Admin rights from your own account");
  }

  try {
    const updated = await prisma.$transaction(async (tx) => {
      if (target.role === "ADMIN" && target.isActive && (!isActive || role !== "ADMIN")) {
        const adminCount = await tx.user.count({ where: { role: "ADMIN", isActive: true } });
        if (adminCount <= 1) throw new Error("LAST_ADMIN");
      }
      return tx.user.update({
        where: { id },
        data: {
          name, username, role, isActive,
          employeeId: role === "EMPLOYEE" ? employeeId : employeeId || null,
          ...(password ? { passwordHash: await hash(password, 12) } : {}),
        },
        select: { id: true, name: true, username: true, role: true, employeeId: true, isActive: true },
      });
    });
    return NextResponse.json({ success: true, data: updated });
  } catch (caught: unknown) {
    if (caught instanceof Error && caught.message === "LAST_ADMIN") {
      return error(400, "LAST_ADMIN", "The last active Admin cannot be disabled or demoted");
    }
    const code = (caught as { code?: string }).code;
    if (code === "P2002") return error(409, "DUPLICATE", "Username or employee is already linked to another account");
    if (code === "P2003") return error(400, "INVALID_EMPLOYEE", "Employee does not exist");
    return error(500, "SERVER_ERROR", "Could not update account");
  }
}
