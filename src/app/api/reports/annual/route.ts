import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, getVisibleEmployeeIds } from "@/lib/auth/current-user";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/lib/permissions";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ success: false, error: { code: "UNAUTHORIZED" } }, { status: 401 });
  if (!hasPermission(user, "REPORT_VIEW")) return NextResponse.json({ success: false, error: { code: "FORBIDDEN" } }, { status: 403 });
  const { searchParams } = new URL(req.url);
  const year = parseInt(searchParams.get("year") || String(new Date().getFullYear()));
  const employee = searchParams.get("employee") || "";
  const visibleEmployeeIds = await getVisibleEmployeeIds(user);

  const start = new Date(year, 0, 1);
  const end = new Date(year, 11, 31, 23, 59, 59);

  const where: any = {
    deletedAt: null,
    plannedStartDate: { lte: end },
    plannedEndDate: { gte: start },
  };

  if (user.role === "EMPLOYEE") {
    where.currentAssigneeId = employee && visibleEmployeeIds?.includes(employee)
      ? employee
      : { in: visibleEmployeeIds ?? [] };
  } else if (employee) {
    where.currentAssigneeId = employee;
  }

  const tasks = await prisma.task.findMany({
    where,
    include: { product: true, currentAssignee: true, assignmentHistory: true },
    orderBy: { plannedStartDate: "asc" },
  });

  // Group by employee
  const employeeMap = new Map<string, any>();

  for (const task of tasks) {
    const assigneeId = task.currentAssigneeId;
    if (!assigneeId) continue;

    if (!employeeMap.has(assigneeId)) {
      employeeMap.set(assigneeId, {
        employee: task.currentAssignee,
        totalAssigned: 0,
        totalCompleted: 0,
        totalPlannedDays: 0,
        totalActualDays: 0,
        onTime: 0,
        late: 0,
        cancelled: 0,
        zoneTasks: 0,
        gateTasks: 0,
        hunterTasks: 0,
        reassignments: 0,
        tasks: [] as any[],
      });
    }

    const emp = employeeMap.get(assigneeId)!;
    emp.reassignments += Math.max(0, task.assignmentHistory.length - 1);
    emp.totalAssigned++;
    if (task.status === "COMPLETED") emp.totalCompleted++;
    if (task.status === "CANCELLED") emp.cancelled++;

    const plannedDays = Math.ceil((task.plannedEndDate.getTime() - task.plannedStartDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    emp.totalPlannedDays += plannedDays;

    if (task.actualEndDate) {
      const actualStart = task.actualStartDate ?? task.plannedStartDate;
      const actualDays = Math.ceil((task.actualEndDate.getTime() - actualStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;
      emp.totalActualDays += actualDays;
      if (task.actualEndDate <= task.plannedEndDate) emp.onTime++;
      else emp.late++;
    }

    if (task.product.code === "ZONE") emp.zoneTasks++;
    if (task.product.code === "GATE") emp.gateTasks++;
    if (task.product.code === "HUNTER") emp.hunterTasks++;

    emp.tasks.push(task);
  }

  const report = Array.from(employeeMap.values());

  return NextResponse.json({ success: true, data: { year, report, total: tasks.length } });
}
