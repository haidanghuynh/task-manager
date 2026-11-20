import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/prisma";
import { recordAuditLog } from "@/lib/audit-log";
import { hasPermission } from "@/lib/permissions";

const CONDITIONS = ["OK", "DAMAGED", "LOST"] as const;

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

  const isHolder = Boolean(device.employeeId && device.employeeId === user.employeeId);
  const canForceReturn = user.role === "ADMIN" || hasPermission(user, "ENVIRONMENT_MANAGE");
  if (!isHolder && !canForceReturn) {
    return NextResponse.json({ success: false, error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const requested = typeof body.returnCondition === "string" ? body.returnCondition.trim().toUpperCase() : "";
  const returnCondition = CONDITIONS.includes(requested as (typeof CONDITIONS)[number]) ? requested : null;
  const note = typeof body.note === "string" ? body.note.trim().slice(0, 500) || null : null;

  // Hỏng thì chuyển bảo trì, mất thì thanh lý; còn lại trả về trống.
  const nextStatus = returnCondition === "DAMAGED" ? "MAINTENANCE" : returnCondition === "LOST" ? "RETIRED" : "AVAILABLE";

  const updated = await prisma.$transaction(async (tx) => {
    await tx.testDeviceUsage.updateMany({
      where: { deviceId: id, returnedAt: null },
      data: { returnedAt: new Date(), returnedById: user.id, returnCondition, note },
    });

    return tx.testDevice.update({
      where: { id },
      data: { employeeId: null, usageStartDate: null, usageEndDate: null, status: nextStatus },
      include: { employee: { select: { id: true, fullName: true, employeeCode: true } } },
    });
  });

  await recordAuditLog({
    request: req,
    actor: user,
    action: "RETURN",
    entityType: "TEST_DEVICE",
    entityId: id,
    entityLabel: updated.code,
    details: { returnedEmployeeId: device.employeeId, returnCondition, status: nextStatus, note },
  });

  return NextResponse.json({ success: true, data: updated });
}
