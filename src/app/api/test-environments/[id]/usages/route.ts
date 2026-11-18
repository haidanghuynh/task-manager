import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/lib/permissions";

// Lịch sử các lượt đăng ký dùng môi trường (dùng chung và cá nhân).
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ success: false, error: { code: "UNAUTHORIZED" } }, { status: 401 });
  if (!hasPermission(user, "ENVIRONMENT_VIEW")) {
    return NextResponse.json({ success: false, error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const { id } = await params;
  const environment = await prisma.testEnvironment.findUnique({
    where: { id },
    select: { id: true, isActive: true },
  });
  if (!environment) {
    return NextResponse.json({ success: false, error: { code: "NOT_FOUND" } }, { status: 404 });
  }

  // Lịch sử chỉ đọc: mọi user có ENVIRONMENT_VIEW đều xem được để dễ đối chiếu.
  const usages = await prisma.testEnvironmentUsage.findMany({
    where: { environmentId: id },
    include: {
      employee: { select: { id: true, fullName: true, employeeCode: true } },
      releasedBy: { select: { id: true, name: true } },
    },
    orderBy: { registeredAt: "desc" },
    take: 200,
  });

  return NextResponse.json({ success: true, data: usages });
}
