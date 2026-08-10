import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ success: false, error: { code: "UNAUTHORIZED" } }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const month = searchParams.get("month") || ""; // format: "2026-08"
  const product = searchParams.get("product") || "";
  const employee = searchParams.get("employee") || "";

  const [year, monthNum] = month ? month.split("-").map(Number) : [new Date().getFullYear(), new Date().getMonth() + 1];
  const start = new Date(year, monthNum - 1, 1);
  const end = new Date(year, monthNum, 0, 23, 59, 59);

  const where: any = {
    deletedAt: null,
    plannedStartDate: { lte: end },
    plannedEndDate: { gte: start },
  };

  if (product) where.productId = product;
  if (employee) where.currentAssigneeId = employee;
  if (user.role === "EMPLOYEE") where.currentAssigneeId = user.employeeId;

  const tasks = await prisma.task.findMany({
    where,
    include: { product: true, currentAssignee: true },
    orderBy: { plannedStartDate: "asc" },
  });

  const employees = user.role === "EMPLOYEE"
    ? await prisma.employee.findMany({ where: { id: user.employeeId! } })
    : await prisma.employee.findMany({ where: { isActive: true }, orderBy: { employeeCode: "asc" } });

  return NextResponse.json({ success: true, data: { tasks, employees, start, end } });
}
