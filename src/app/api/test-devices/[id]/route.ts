import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/prisma";
import { recordAuditLog } from "@/lib/audit-log";
import { hasPermission } from "@/lib/permissions";
import { isDeviceCategory, isDeviceStatus } from "@/lib/test-devices";
import type { AppUser } from "@/lib/auth/current-user";

const include = {
  employee: { select: { id: true, fullName: true, employeeCode: true } },
  createdBy: { select: { id: true, name: true } },
};

const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");

function canManage(user: AppUser): boolean {
  return user.role === "ADMIN" || hasPermission(user, "ENVIRONMENT_MANAGE");
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ success: false, error: { code: "UNAUTHORIZED" } }, { status: 401 });
  if (!canManage(user)) return NextResponse.json({ success: false, error: { code: "FORBIDDEN" } }, { status: 403 });

  const { id } = await params;
  const device = await prisma.testDevice.findUnique({ where: { id } });
  if (!device || !device.isActive) {
    return NextResponse.json({ success: false, error: { code: "NOT_FOUND" } }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const data: {
    name?: string; category?: string; purpose?: string | null; os?: string | null;
    serialNumber?: string | null; location?: string | null; note?: string | null; status?: string;
  } = {};

  if (body.name !== undefined) {
    const name = text(body.name);
    if (!name) return NextResponse.json({ success: false, error: { code: "VALIDATION_ERROR", message: "name is required" } }, { status: 400 });
    data.name = name;
  }
  if (body.category !== undefined) {
    const category = text(body.category).toUpperCase();
    if (!isDeviceCategory(category)) {
      return NextResponse.json({ success: false, error: { code: "VALIDATION_ERROR", message: "invalid category" } }, { status: 400 });
    }
    data.category = category;
  }
  if (body.purpose !== undefined) data.purpose = text(body.purpose) || null;
  if (body.os !== undefined) data.os = text(body.os) || null;
  if (body.serialNumber !== undefined) data.serialNumber = text(body.serialNumber) || null;
  if (body.location !== undefined) data.location = text(body.location) || null;
  if (body.note !== undefined) data.note = text(body.note) || null;

  if (body.status !== undefined) {
    const status = text(body.status).toUpperCase();
    if (!isDeviceStatus(status) || status === "IN_USE") {
      return NextResponse.json({ success: false, error: { code: "VALIDATION_ERROR", message: "invalid status" } }, { status: 400 });
    }
    if (device.employeeId) {
      return NextResponse.json({ success: false, error: { code: "IN_USE", message: "Return the device before changing its status" } }, { status: 409 });
    }
    data.status = status;
  }

  const updated = await prisma.testDevice.update({ where: { id }, data, include });

  await recordAuditLog({
    request: req,
    actor: user,
    action: "UPDATE",
    entityType: "TEST_DEVICE",
    entityId: id,
    entityLabel: updated.code,
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
  if (!canManage(user)) return NextResponse.json({ success: false, error: { code: "FORBIDDEN" } }, { status: 403 });

  const { id } = await params;
  const device = await prisma.testDevice.findUnique({ where: { id }, select: { id: true, code: true, employeeId: true, isActive: true } });
  if (!device || !device.isActive) {
    return NextResponse.json({ success: false, error: { code: "NOT_FOUND" } }, { status: 404 });
  }
  if (device.employeeId) {
    return NextResponse.json({ success: false, error: { code: "IN_USE", message: "Return the device before deleting it" } }, { status: 409 });
  }

  // Đã có lịch sử mượn/trả thì chỉ ngừng hiển thị để giữ lịch sử.
  const usageCount = await prisma.testDeviceUsage.count({ where: { deviceId: id } });
  if (usageCount > 0) {
    await prisma.testDevice.update({ where: { id }, data: { isActive: false } });
  } else {
    await prisma.testDevice.delete({ where: { id } });
  }

  await recordAuditLog({
    request: req,
    actor: user,
    action: usageCount > 0 ? "DEACTIVATE" : "DELETE",
    entityType: "TEST_DEVICE",
    entityId: id,
    entityLabel: device.code,
    details: usageCount > 0 ? { reason: "HAS_USAGE_HISTORY", usageCount } : undefined,
  });

  return NextResponse.json({ success: true, data: { deactivated: usageCount > 0, usageCount } });
}
