import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/prisma";
import { recordAuditLog } from "@/lib/audit-log";
import { hasPermission } from "@/lib/permissions";
import { getBusinessDateBoundary } from "@/lib/date";

const include = { employee: { select: { id: true, fullName: true, employeeCode: true } } };

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ success: false, error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const { id } = await params;
  const device = await prisma.testDevice.findUnique({ where: { id } });
  if (!device || !device.isActive) {
    return NextResponse.json({ success: false, error: { code: "NOT_FOUND" } }, { status: 404 });
  }
  if (device.employeeId) {
    return NextResponse.json({ success: false, error: { code: "IN_USE", message: "Device is already in use" } }, { status: 409 });
  }
  if (device.status === "MAINTENANCE" || device.status === "RETIRED") {
    return NextResponse.json({ success: false, error: { code: "UNAVAILABLE", message: "Device is not available" } }, { status: 409 });
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

  const startDate = toDate(body.startDate) ?? getBusinessDateBoundary();
  const endDate = toDate(body.endDate) ?? startDate;
  if (endDate.getTime() < startDate.getTime()) {
    return NextResponse.json({ success: false, error: { code: "VALIDATION_ERROR", message: "endDate must be on or after startDate" } }, { status: 400 });
  }
  const note = typeof body.note === "string" ? body.note.trim().slice(0, 500) || null : null;

  const updated = await prisma.$transaction(async (tx) => {
    const claimed = await tx.testDevice.updateMany({
      where: { id, isActive: true, employeeId: null, status: { in: ["AVAILABLE"] } },
      data: { employeeId, usageStartDate: startDate, usageEndDate: endDate, status: "IN_USE" },
    });
    if (claimed.count === 0) return null;

    await tx.testDeviceUsage.create({
      data: { deviceId: id, employeeId, startDate, endDate, note },
    });

    return tx.testDevice.findUnique({ where: { id }, include });
  });

  if (!updated) {
    return NextResponse.json({ success: false, error: { code: "IN_USE", message: "Device is already in use" } }, { status: 409 });
  }

  await recordAuditLog({
    request: req,
    actor: user,
    action: "CHECKOUT",
    entityType: "TEST_DEVICE",
    entityId: id,
    entityLabel: updated.code,
    details: { employeeId, startDate, endDate },
  });

  return NextResponse.json({ success: true, data: updated });
}
