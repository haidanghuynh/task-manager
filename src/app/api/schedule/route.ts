import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, getVisibleEmployeeIds } from "@/lib/auth/current-user";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ success: false, error: { code: "UNAUTHORIZED" } }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const month = searchParams.get("month") || ""; // format: "2026-08"
  const product = searchParams.get("product") || "";
  const employee = searchParams.get("employee") || "";
  const includeCompleted = searchParams.get("includeCompleted") === "true";
  const visibleEmployeeIds = await getVisibleEmployeeIds(user);

  const [year, monthNum] = month ? month.split("-").map(Number) : [new Date().getFullYear(), new Date().getMonth() + 1];
  const start = new Date(year, monthNum - 1, 1);
  const end = new Date(year, monthNum, 0, 23, 59, 59);

  const where: any = {
    deletedAt: null,
    currentAssigneeId: { not: null },
    plannedStartDate: { lte: end },
    plannedEndDate: { gte: start },
  };

  if (!includeCompleted) where.status = { notIn: ["COMPLETED", "CANCELLED"] };
  if (product) where.productId = product;
  if (user.role === "EMPLOYEE") {
    where.currentAssigneeId = employee && visibleEmployeeIds?.includes(employee)
      ? employee
      : { in: visibleEmployeeIds ?? [] };
  } else if (employee) {
    where.currentAssigneeId = employee;
  }

  const tasks = await prisma.task.findMany({
    where,
    include: { product: true, currentAssignee: true },
    orderBy: { plannedStartDate: "asc" },
  });

  const employees = user.role === "EMPLOYEE"
    ? await prisma.employee.findMany({
        where: { id: { in: visibleEmployeeIds ?? [] }, isActive: true },
        orderBy: { employeeCode: "asc" },
      })
    : await prisma.employee.findMany({ where: { isActive: true }, orderBy: { employeeCode: "asc" } });

  return NextResponse.json({ success: true, data: { tasks, employees, start, end } });
}
