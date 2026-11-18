import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/prisma";
import { recordAuditLog } from "@/lib/audit-log";
import { hasPermission } from "@/lib/permissions";
import { getBusinessDateBoundary } from "@/lib/date";
import type { AppUser } from "@/lib/auth/current-user";

const include = {
  product: true,
  employee: { select: { id: true, fullName: true, employeeCode: true } },
  createdBy: { select: { id: true, name: true } },
};

async function canManagePersonal(user: AppUser, environment: { employeeId: string | null }): Promise<boolean> {
  if (user.role === "ADMIN") return true;
  if (environment.employeeId && environment.employeeId === user.employeeId) return true;
  if (user.role === "MANAGER" && user.teamId && environment.employeeId) {
    const member = await prisma.employee.findFirst({
      where: { id: environment.employeeId, teamId: user.teamId },
      select: { id: true },
    });
    return Boolean(member);
  }
  return false;
}

export async function PATCH(
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

  if (environment.type === "SHARED") {
    if (user.role !== "ADMIN" && !hasPermission(user, "ENVIRONMENT_MANAGE")) {
      return NextResponse.json({ success: false, error: { code: "FORBIDDEN" } }, { status: 403 });
    }
  } else if (!(await canManagePersonal(user, environment))) {
    return NextResponse.json({ success: false, error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const text = (value: unknown): string | undefined => (typeof value === "string" ? value.trim() : undefined);
  const toDate = (value: unknown): Date | null => {
    if (typeof value !== "string" || !value.trim()) return null;
    const date = new Date(value.trim());
    return Number.isNaN(date.getTime()) ? null : date;
  };

  const data: Record<string, unknown> = {};
  if (body.usagePeriod !== undefined) data.usagePeriod = toDate(body.usagePeriod);
  if (body.usageEndDate !== undefined) data.usageEndDate = toDate(body.usageEndDate);
  if (body.os !== undefined) data.os = text(body.os) || null;
  if (body.setupType !== undefined) data.setupType = body.setupType === "UPDATE" ? "UPDATE" : "NEW";
  if (body.virus !== undefined) data.virus = text(body.virus) || null;
  if (body.hostName !== undefined) data.hostName = text(body.hostName) || null;
  if (body.ip !== undefined) data.ip = text(body.ip) || null;
  if (body.url !== undefined) data.url = text(body.url) || null;
  if (body.deliveryDomain !== undefined) data.deliveryDomain = text(body.deliveryDomain) || null;
  if (body.version !== undefined) data.version = text(body.version) || null;
  if (body.buildInfo !== undefined) data.buildInfo = text(body.buildInfo) || null;
  if (body.commonVersion !== undefined) data.commonVersion = text(body.commonVersion) || null;
  if (body.sophosVersion !== undefined) data.sophosVersion = text(body.sophosVersion) || null;

  // Admin/Manager có thể đổi sản phẩm, người dùng và loại môi trường.
  if (user.role !== "EMPLOYEE") {
    if (typeof body.productId === "string" && body.productId.trim()) data.productId = body.productId.trim();
    if (typeof body.employeeId === "string") data.employeeId = body.employeeId.trim() || null;
    if (body.type === "PERSONAL" || body.type === "SHARED") data.type = body.type;
  }

  // Lịch sử dùng: đổi người phụ trách thì đóng lượt cũ và mở lượt mới;
  // chỉ đổi khoảng ngày thì cập nhật lượt đang mở.
  const nextEmployeeId = "employeeId" in data ? (data.employeeId as string | null) : environment.employeeId;
  const employeeChanged = nextEmployeeId !== environment.employeeId;
  const nextStart = "usagePeriod" in data ? (data.usagePeriod as Date | null) : environment.usagePeriod;
  const nextEnd = "usageEndDate" in data ? (data.usageEndDate as Date | null) : environment.usageEndDate;
  if (nextEmployeeId === null) {
    data.usagePeriod = null;
    data.usageEndDate = null;
  }

  const updated = await prisma.$transaction(async (tx) => {
    const saved = await tx.testEnvironment.update({ where: { id }, data, include });

    if (employeeChanged) {
      if (environment.employeeId) {
        await tx.testEnvironmentUsage.updateMany({
          where: { environmentId: id, releasedAt: null },
          data: { releasedAt: new Date(), releasedById: user.id, releaseReason: "CHANGED" },
        });
      }
      if (nextEmployeeId) {
        const start = nextStart ?? getBusinessDateBoundary();
        await tx.testEnvironmentUsage.create({
          data: { environmentId: id, employeeId: nextEmployeeId, startDate: start, endDate: nextEnd ?? start },
        });
      }
    } else if (environment.employeeId && (body.usagePeriod !== undefined || body.usageEndDate !== undefined)) {
      const start = nextStart ?? getBusinessDateBoundary();
      await tx.testEnvironmentUsage.updateMany({
        where: { environmentId: id, releasedAt: null },
        data: { startDate: start, endDate: nextEnd ?? start },
      });
    }

    return saved;
  });

  await recordAuditLog({
    request: req,
    actor: user,
    action: "UPDATE",
    entityType: "TEST_ENVIRONMENT",
    entityId: id,
    entityLabel: `${updated.type}:${updated.productId}`,
    details: data,
  });

  return NextResponse.json({ success: true, data: updated });
}

export async function DELETE(
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

  if (environment.type === "SHARED") {
    if (user.role !== "ADMIN") {
      return NextResponse.json({ success: false, error: { code: "FORBIDDEN" } }, { status: 403 });
    }
  } else if (!(await canManagePersonal(user, environment))) {
    return NextResponse.json({ success: false, error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  await prisma.$transaction(async (tx) => {
    await tx.testEnvironmentUsage.updateMany({
      where: { environmentId: id, releasedAt: null },
      data: { releasedAt: new Date(), releasedById: user.id, releaseReason: "DELETED" },
    });
    await tx.testEnvironment.update({ where: { id }, data: { isActive: false } });
  });
  await recordAuditLog({
    request: req,
    actor: user,
    action: "DELETE",
    entityType: "TEST_ENVIRONMENT",
    entityId: id,
    entityLabel: `${environment.type}:${environment.productId}`,
  });

  return NextResponse.json({ success: true, message: "Test environment deleted" });
}
