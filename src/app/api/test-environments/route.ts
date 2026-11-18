import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/prisma";
import { recordAuditLog } from "@/lib/audit-log";
import { hasPermission } from "@/lib/permissions";

const include = {
  product: true,
  employee: { select: { id: true, fullName: true, employeeCode: true } },
  createdBy: { select: { id: true, name: true } },
};

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ success: false, error: { code: "UNAUTHORIZED" } }, { status: 401 });
  if (!hasPermission(user, "ENVIRONMENT_VIEW")) {
    return NextResponse.json({ success: false, error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type") || "";
  const productId = searchParams.get("productId") || "";
  const search = searchParams.get("search") || "";

  const and: Prisma.TestEnvironmentWhereInput[] = [{ isActive: true }];
  if (type === "PERSONAL" || type === "SHARED") and.push({ type });
  if (productId) and.push({ productId });

  // Ai có ENVIRONMENT_VIEW đều xem được toàn bộ môi trường; quyền ghi vẫn được
  // kiểm tra riêng ở POST/PATCH/DELETE và register/release.
  if (search.trim()) {
    const value = search.trim();
    and.push({
      OR: [
        { hostName: { contains: value } },
        { ip: { contains: value } },
        { url: { contains: value } },
        { version: { contains: value } },
        { buildInfo: { contains: value } },
        { commonVersion: { contains: value } },
        { sophosVersion: { contains: value } },
        { os: { contains: value } },
        { deliveryDomain: { contains: value } },
        { employee: { fullName: { contains: value } } },
        { product: { name: { contains: value } } },
      ],
    });
  }

  const environments = await prisma.testEnvironment.findMany({
    where: { AND: and },
    include,
    orderBy: [{ type: "asc" }, { productId: "asc" }, { createdAt: "desc" }],
  });
  return NextResponse.json({ success: true, data: environments });
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ success: false, error: { code: "UNAUTHORIZED" } }, { status: 401 });
  if (user.role !== "EMPLOYEE" && !hasPermission(user, "ENVIRONMENT_MANAGE")) {
    return NextResponse.json({ success: false, error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const productId = typeof body.productId === "string" ? body.productId.trim() : "";
  const requestedType = body.type === "SHARED" ? "SHARED" : "PERSONAL";

  if (!productId) {
    return NextResponse.json({ success: false, error: { code: "VALIDATION_ERROR", message: "productId is required" } }, { status: 400 });
  }

  // Employee chỉ tạo môi trường cá nhân cho chính mình.
  let type = requestedType;
  let employeeId: string | null = null;
  if (user.role === "EMPLOYEE") {
    type = "PERSONAL";
    employeeId = user.employeeId;
  } else if (type === "PERSONAL") {
    employeeId = typeof body.employeeId === "string" && body.employeeId.trim()
      ? body.employeeId.trim()
      : user.employeeId;
  }

  const text = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : null);
  const toDate = (value: unknown): Date | null => {
    if (typeof value !== "string" || !value.trim()) return null;
    const date = new Date(value.trim());
    return Number.isNaN(date.getTime()) ? null : date;
  };

  const environment = await prisma.$transaction(async (tx) => {
    const created = await tx.testEnvironment.create({
      data: {
        type,
        productId,
        employeeId,
        usagePeriod: toDate(body.usagePeriod),
        usageEndDate: toDate(body.usageEndDate),
        os: text(body.os),
        setupType: body.setupType === "UPDATE" ? "UPDATE" : "NEW",
        virus: text(body.virus),
        hostName: text(body.hostName),
        ip: text(body.ip),
        url: text(body.url),
        deliveryDomain: text(body.deliveryDomain),
        version: text(body.version),
        buildInfo: text(body.buildInfo),
        commonVersion: text(body.commonVersion),
        sophosVersion: text(body.sophosVersion),
        createdById: user.id,
      },
      include,
    });

    // Môi trường đã có người dùng ngay khi tạo thì mở luôn một lượt trong lịch sử.
    if (created.employeeId) {
      const start = created.usagePeriod ?? new Date();
      await tx.testEnvironmentUsage.create({
        data: { environmentId: created.id, employeeId: created.employeeId, startDate: start, endDate: created.usageEndDate ?? start },
      });
    }

    return created;
  });

  await recordAuditLog({
    request: req,
    actor: user,
    action: "CREATE",
    entityType: "TEST_ENVIRONMENT",
    entityId: environment.id,
    entityLabel: `${environment.type}:${environment.productId}`,
    details: { type, productId, employeeId },
  });

  return NextResponse.json({ success: true, data: environment }, { status: 201 });
}
