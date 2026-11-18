import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/lib/permissions";
import { getBusinessDateBoundary } from "@/lib/date";

const DAY_MS = 24 * 60 * 60 * 1000;

// Môi trường dùng chung sắp hết hạn hoặc đã quá hạn trả.
// Người đang giữ và trưởng nhóm của họ nhận cảnh báo; Admin thấy tất cả.
// `days` là số ngày cảnh báo trước (0-30, mặc định 3).
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ success: false, error: { code: "UNAUTHORIZED" } }, { status: 401 });
  if (!hasPermission(user, "ENVIRONMENT_VIEW")) {
    return NextResponse.json({ success: false, error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const requested = Number.parseInt(new URL(req.url).searchParams.get("days") || "3", 10);
  const days = Number.isFinite(requested) ? Math.min(Math.max(requested, 0), 30) : 3;

  const today = getBusinessDateBoundary();
  const limit = new Date(today.getTime() + days * DAY_MS);

  const where: Prisma.TestEnvironmentWhereInput = {
    isActive: true,
    type: "SHARED",
    employeeId: { not: null },
    usageEndDate: { not: null, lte: limit },
  };

  if (user.role !== "ADMIN") {
    const employeeIds = new Set<string>();
    if (user.employeeId) employeeIds.add(user.employeeId);

    // Trưởng nhóm (Team.leadId) nhận cảnh báo cho môi trường của thành viên trong nhóm.
    if (user.employeeId) {
      const ledTeams = await prisma.team.findMany({ where: { leadId: user.employeeId }, select: { id: true } });
      if (ledTeams.length > 0) {
        const members = await prisma.employee.findMany({
          where: { teamId: { in: ledTeams.map((team) => team.id) }, isActive: true },
          select: { id: true },
        });
        for (const member of members) employeeIds.add(member.id);
      }
    }

    // Manager phụ trách team hiện tại cũng nhận cảnh báo của team đó.
    if (user.role === "MANAGER" && user.teamId) {
      const members = await prisma.employee.findMany({
        where: { teamId: user.teamId, isActive: true },
        select: { id: true },
      });
      for (const member of members) employeeIds.add(member.id);
    }

    if (employeeIds.size === 0) return NextResponse.json({ success: true, data: [] });
    where.employeeId = { in: [...employeeIds] };
  }

  const environments = await prisma.testEnvironment.findMany({
    where,
    include: {
      product: { select: { id: true, code: true, name: true, color: true } },
      employee: { select: { id: true, fullName: true, employeeCode: true } },
    },
    orderBy: { usageEndDate: "asc" },
    take: 50,
  });

  return NextResponse.json({
    success: true,
    data: environments,
    meta: { today: today.toISOString(), days },
  });
}
