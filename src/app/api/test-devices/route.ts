import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/prisma";
import { recordAuditLog } from "@/lib/audit-log";
import { hasPermission } from "@/lib/permissions";
import { DEVICE_CODE_PATTERN, isDeviceCategory, isDeviceStatus } from "@/lib/test-devices";

const include = {
  employee: { select: { id: true, fullName: true, employeeCode: true } },
  createdBy: { select: { id: true, name: true } },
};

const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ success: false, error: { code: "UNAUTHORIZED" } }, { status: 401 });
  if (!hasPermission(user, "ENVIRONMENT_VIEW")) {
    return NextResponse.json({ success: false, error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") || "";
  const category = searchParams.get("category") || "";
  const search = searchParams.get("search") || "";

  const where: Prisma.TestDeviceWhereInput = { isActive: true };
  if (isDeviceStatus(status)) where.status = status;
  if (isDeviceCategory(category)) where.category = category;
  if (search.trim()) {
    const value = search.trim();
    where.OR = [
      { code: { contains: value } },
      { name: { contains: value } },
      { purpose: { contains: value } },
      { serialNumber: { contains: value } },
      { os: { contains: value } },
      { employee: { fullName: { contains: value } } },
    ];
  }

  const devices = await prisma.testDevice.findMany({
    where,
    include,
    orderBy: [{ status: "asc" }, { code: "asc" }],
  });

  return NextResponse.json({ success: true, data: devices });
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ success: false, error: { code: "UNAUTHORIZED" } }, { status: 401 });
  if (user.role !== "ADMIN" && !hasPermission(user, "ENVIRONMENT_MANAGE")) {
    return NextResponse.json({ success: false, error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const code = text(body.code).toUpperCase();
  const name = text(body.name);
  const category = text(body.category).toUpperCase();

  if (!code || !name) {
    return NextResponse.json({ success: false, error: { code: "VALIDATION_ERROR", message: "code and name are required" } }, { status: 400 });
  }
  if (!DEVICE_CODE_PATTERN.test(code)) {
    return NextResponse.json({ success: false, error: { code: "VALIDATION_ERROR", message: "code must use A-Z, 0-9, dot, underscore or hyphen" } }, { status: 400 });
  }

  try {
    const device = await prisma.testDevice.create({
      data: {
        code,
        name,
        category: isDeviceCategory(category) ? category : "LAPTOP",
        purpose: text(body.purpose) || null,
        os: text(body.os) || null,
        serialNumber: text(body.serialNumber) || null,
        location: text(body.location) || null,
        note: text(body.note) || null,
        createdById: user.id,
      },
      include,
    });

    await recordAuditLog({
      request: req,
      actor: user,
      action: "CREATE",
      entityType: "TEST_DEVICE",
      entityId: device.id,
      entityLabel: device.code,
      details: { name: device.name, category: device.category },
    });

    return NextResponse.json({ success: true, data: device }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ success: false, error: { code: "DUPLICATE", message: "Device code already exists" } }, { status: 409 });
    }
    throw error;
  }
}
