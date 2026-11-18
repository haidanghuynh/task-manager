import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/prisma";
import { recordAuditLog } from "@/lib/audit-log";

const MAX_NAME_LENGTH = 80;
const MAX_GROUP_LENGTH = 40;

function parseName(value: unknown): string {
  return typeof value === "string" ? value.trim().slice(0, MAX_NAME_LENGTH) : "";
}

function parseGroupName(value: unknown): string {
  const groupName = typeof value === "string" ? value.trim().slice(0, MAX_GROUP_LENGTH) : "";
  return groupName || "Khác";
}

function parseSortOrder(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return 0;
  return Math.min(Math.max(Math.trunc(parsed), 0), 9999);
}

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ success: false, error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const activeOnly = new URL(req.url).searchParams.get("active") === "true";
  const options = await prisma.testEnvironmentOsOption.findMany({
    where: activeOnly ? { isActive: true } : undefined,
    orderBy: [{ isActive: "desc" }, { sortOrder: "asc" }, { name: "asc" }],
  });
  return NextResponse.json({ success: true, data: options });
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ success: false, error: { code: "UNAUTHORIZED" } }, { status: 401 });
  if (user.role !== "ADMIN") return NextResponse.json({ success: false, error: { code: "FORBIDDEN" } }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const name = parseName(body.name);
  if (!name) {
    return NextResponse.json({ success: false, error: { code: "VALIDATION_ERROR", message: "name is required" } }, { status: 400 });
  }

  const groupName = parseGroupName(body.groupName);
  const sortOrder = parseSortOrder(body.sortOrder);

  // Tên đã tồn tại nhưng đang ngừng dùng thì kích hoạt lại thay vì báo trùng.
  const existing = await prisma.testEnvironmentOsOption.findUnique({ where: { name } });
  if (existing?.isActive) {
    return NextResponse.json({ success: false, error: { code: "DUPLICATE", message: "OS name already exists" } }, { status: 409 });
  }

  const option = existing
    ? await prisma.testEnvironmentOsOption.update({
        where: { id: existing.id },
        data: { groupName, sortOrder, isActive: true },
      })
    : await prisma.testEnvironmentOsOption.create({ data: { name, groupName, sortOrder } });

  await recordAuditLog({
    request: req,
    actor: user,
    action: existing ? "ACTIVATE" : "CREATE",
    entityType: "TEST_ENVIRONMENT_OS",
    entityId: option.id,
    entityLabel: option.name,
    details: { groupName: option.groupName, sortOrder: option.sortOrder },
  });

  return NextResponse.json({ success: true, data: option }, { status: existing ? 200 : 201 });
}

export async function PATCH(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ success: false, error: { code: "UNAUTHORIZED" } }, { status: 401 });
  if (user.role !== "ADMIN") return NextResponse.json({ success: false, error: { code: "FORBIDDEN" } }, { status: 403 });

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ success: false, error: { code: "VALIDATION_ERROR", message: "id is required" } }, { status: 400 });

  const current = await prisma.testEnvironmentOsOption.findUnique({ where: { id } });
  if (!current) return NextResponse.json({ success: false, error: { code: "NOT_FOUND" } }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const data: { name?: string; groupName?: string; sortOrder?: number; isActive?: boolean } = {};

  if (body.name !== undefined) {
    const name = parseName(body.name);
    if (!name) {
      return NextResponse.json({ success: false, error: { code: "VALIDATION_ERROR", message: "name is required" } }, { status: 400 });
    }
    if (name !== current.name) {
      const duplicate = await prisma.testEnvironmentOsOption.findUnique({ where: { name } });
      if (duplicate) {
        return NextResponse.json({ success: false, error: { code: "DUPLICATE", message: "OS name already exists" } }, { status: 409 });
      }
    }
    data.name = name;
  }
  if (body.groupName !== undefined) data.groupName = parseGroupName(body.groupName);
  if (body.sortOrder !== undefined) data.sortOrder = parseSortOrder(body.sortOrder);
  if (body.isActive !== undefined) data.isActive = Boolean(body.isActive);

  // syncExisting: đổi tên option thì cập nhật luôn TestEnvironment.os đang dùng tên cũ.
  const syncExisting = body.syncExisting === true && data.name !== undefined && data.name !== current.name;

  const { updated, syncedEnvironments } = await prisma.$transaction(async (tx) => {
    const option = await tx.testEnvironmentOsOption.update({ where: { id }, data });
    const synced = syncExisting
      ? (await tx.testEnvironment.updateMany({ where: { os: current.name }, data: { os: option.name } })).count
      : 0;
    return { updated: option, syncedEnvironments: synced };
  });

  await recordAuditLog({
    request: req,
    actor: user,
    action: data.isActive === true ? "ACTIVATE" : data.isActive === false ? "DEACTIVATE" : "UPDATE",
    entityType: "TEST_ENVIRONMENT_OS",
    entityId: updated.id,
    entityLabel: updated.name,
    details: { ...data, previousName: current.name, syncedEnvironments },
  });

  return NextResponse.json({ success: true, data: { ...updated, syncedEnvironments } });
}

export async function DELETE(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ success: false, error: { code: "UNAUTHORIZED" } }, { status: 401 });
  if (user.role !== "ADMIN") return NextResponse.json({ success: false, error: { code: "FORBIDDEN" } }, { status: 403 });

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ success: false, error: { code: "VALIDATION_ERROR", message: "id is required" } }, { status: 400 });

  const option = await prisma.testEnvironmentOsOption.findUnique({ where: { id }, select: { name: true } });
  if (!option) return NextResponse.json({ success: false, error: { code: "NOT_FOUND" } }, { status: 404 });

  // TestEnvironment lưu os dạng text: option đang được dùng thì chỉ ngừng hiển thị,
  // dữ liệu cũ giữ nguyên; chưa dùng thì xóa hẳn.
  const usageCount = await prisma.testEnvironment.count({ where: { os: option.name } });
  if (usageCount > 0) {
    await prisma.testEnvironmentOsOption.update({ where: { id }, data: { isActive: false } });
  } else {
    await prisma.testEnvironmentOsOption.delete({ where: { id } });
  }

  await recordAuditLog({
    request: req,
    actor: user,
    action: usageCount > 0 ? "DEACTIVATE" : "DELETE",
    entityType: "TEST_ENVIRONMENT_OS",
    entityId: id,
    entityLabel: option.name,
    details: usageCount > 0 ? { reason: "HAS_EXISTING_ENVIRONMENTS", usageCount } : undefined,
  });

  return NextResponse.json({ success: true, data: { deactivated: usageCount > 0, usageCount } });
}
