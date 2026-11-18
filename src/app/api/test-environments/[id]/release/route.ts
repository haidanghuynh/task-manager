import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/prisma";
import { recordAuditLog } from "@/lib/audit-log";
import { hasPermission } from "@/lib/permissions";

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
    return NextResponse.json({ success: false, error: { code: "INVALID_STATE", message: "Only shared environments can be released" } }, { status: 400 });
  }

  const isHolder = Boolean(environment.employeeId && environment.employeeId === user.employeeId);
  const canForceRelease = user.role === "ADMIN" || hasPermission(user, "ENVIRONMENT_MANAGE");
  if (!isHolder && !canForceRelease) {
    return NextResponse.json({ success: false, error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const releaseReason = typeof body.releaseReason === "string" ? body.releaseReason.trim().slice(0, 200) || null : null;

  const updated = await prisma.$transaction(async (tx) => {
    // Đóng lượt đăng ký đang mở để lịch sử biết ai đã trả và trả lúc nào.
    await tx.testEnvironmentUsage.updateMany({
      where: { environmentId: id, releasedAt: null },
      data: { releasedAt: new Date(), releasedById: user.id, releaseReason },
    });

    return tx.testEnvironment.update({
      where: { id },
      data: { employeeId: null, usagePeriod: null, usageEndDate: null },
      include: { product: true, employee: { select: { id: true, fullName: true, employeeCode: true } } },
    });
  });

  await recordAuditLog({
    request: req,
    actor: user,
    action: "RELEASE",
    entityType: "TEST_ENVIRONMENT",
    entityId: id,
    entityLabel: `${updated.type}:${updated.productId}`,
    details: { releasedEmployeeId: environment.employeeId, releaseReason },
  });

  return NextResponse.json({ success: true, data: updated });
}
