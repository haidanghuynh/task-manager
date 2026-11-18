import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/prisma";
import { recordAuditLog } from "@/lib/audit-log";
import { hasPermission } from "@/lib/permissions";
import { getBusinessDateBoundary } from "@/lib/date";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ success: false, error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const { id } = await params;
  const environment = await prisma.testEnvironment.findUnique({ where: { id } });
  if (!environment || !environment.isActive) {
    return NextResponse.json({ success: false, error: { code: "NOT_FOUND" } }, { status: 404 });
  }
  if (environment.type !== "SHARED") {
    return NextResponse.json({ success: false, error: { code: "INVALID_STATE", message: "Only shared environments can be registered" } }, { status: 400 });
  }
  if (environment.employeeId) {
    return NextResponse.json({ success: false, error: { code: "IN_USE", message: "Environment is already in use" } }, { status: 409 });
  }

  const body = await req.json().catch(() => ({}));

  let employeeId = user.employeeId;
  if (!employeeId && (user.role === "ADMIN" || hasPermission(user, "ENVIRONMENT_MANAGE"))) {
    const requested = typeof body.employeeId === "string" ? body.employeeId.trim() : "";
    if (requested) {
      const employee = await prisma.employee.findFirst({ where: { id: requested, isActive: true }, select: { id: true } });
      employeeId = employee?.id ?? null;
    }
  }
  if (!employeeId) {
    return NextResponse.json({ success: false, error: { code: "NO_EMPLOYEE", message: "Account is not linked to an employee" } }, { status: 400 });
  }

  const toDate = (value: unknown): Date | null => {
    if (typeof value !== "string" || !value.trim()) return null;
    const date = new Date(value.trim());
    return Number.isNaN(date.getTime()) ? null : date;
  };

  // UI gửi startDate/endDate; usagePeriod được giữ để tương thích dữ liệu cũ.
  const startDate = toDate(body.startDate ?? body.usagePeriod) ?? getBusinessDateBoundary();
  const endDate = toDate(body.endDate) ?? startDate;
  if (endDate.getTime() < startDate.getTime()) {
    return NextResponse.json({ success: false, error: { code: "VALIDATION_ERROR", message: "endDate must be on or after startDate" } }, { status: 400 });
  }

  // Claim nguyên tử để hai người không đăng ký cùng lúc, đồng thời ghi lịch sử.
  const updated = await prisma.$transaction(async (tx) => {
    const claimed = await tx.testEnvironment.updateMany({
      where: { id, isActive: true, type: "SHARED", employeeId: null },
      data: { employeeId, usagePeriod: startDate, usageEndDate: endDate },
    });
    if (claimed.count === 0) return null;

    await tx.testEnvironmentUsage.create({
      data: { environmentId: id, employeeId, startDate, endDate },
    });

    return tx.testEnvironment.findUnique({
      where: { id },
      include: { product: true, employee: { select: { id: true, fullName: true, employeeCode: true } } },
    });
  });

  if (!updated) {
    return NextResponse.json({ success: false, error: { code: "IN_USE", message: "Environment is already in use" } }, { status: 409 });
  }

  await recordAuditLog({
    request: req,
    actor: user,
    action: "REGISTER",
    entityType: "TEST_ENVIRONMENT",
    entityId: id,
    entityLabel: `${updated.type}:${updated.productId}`,
    details: { employeeId: updated.employeeId, startDate, endDate },
  });

  return NextResponse.json({ success: true, data: updated });
}
