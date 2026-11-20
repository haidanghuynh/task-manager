import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/lib/permissions";

// Lịch sử mượn/trả thiết bị; mọi user có ENVIRONMENT_VIEW đều xem được (chỉ đọc).
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
  const device = await prisma.testDevice.findUnique({ where: { id }, select: { id: true } });
  if (!device) {
    return NextResponse.json({ success: false, error: { code: "NOT_FOUND" } }, { status: 404 });
  }

  const usages = await prisma.testDeviceUsage.findMany({
    where: { deviceId: id },
    include: {
      employee: { select: { id: true, fullName: true, employeeCode: true } },
      returnedBy: { select: { id: true, name: true } },
    },
    orderBy: { checkedOutAt: "desc" },
    take: 200,
  });

  return NextResponse.json({ success: true, data: usages });
}
