import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, getVisibleEmployeeIds } from "@/lib/auth/current-user";
import { prisma } from "@/lib/prisma";
import { checkOverlap } from "@/services/task.service";
import { hasPermission } from "@/lib/permissions";

function error(status: number, code: string, message?: string) {
  return NextResponse.json({ success: false, error: { code, message } }, { status });
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return error(401, "UNAUTHORIZED");
  if (!hasPermission(user, "TASK_ASSIGN")) return error(403, "FORBIDDEN");

  const body = await req.json().catch(() => null);
  const rawTaskIds: unknown[] = Array.isArray(body?.taskIds) ? body.taskIds : [];
  const taskIds: string[] = [
    ...new Set(rawTaskIds.filter((id): id is string => typeof id === "string" && id.length > 0)),
  ];
  const employeeId = typeof body?.employeeId === "string" ? body.employeeId : "";
  const reason = typeof body?.reason === "string" ? body.reason.trim() : "";

  if (taskIds.length === 0 || taskIds.length > 200) return error(400, "INVALID_TASKS", "Select 1-200 tasks");
  if (!employeeId) return error(400, "INVALID_EMPLOYEE", "Employee is required");
  if (user.role === "EMPLOYEE") {
    const visibleEmployeeIds = await getVisibleEmployeeIds(user);
    if (!visibleEmployeeIds?.includes(employeeId)) return error(403, "FORBIDDEN");
  }

  const [employee, tasks] = await Promise.all([
    prisma.employee.findUnique({ where: { id: employeeId }, select: { id: true, isActive: true } }),
    prisma.task.findMany({
      where: { id: { in: taskIds }, deletedAt: null },
      select: { id: true, currentAssigneeId: true, plannedStartDate: true, plannedEndDate: true },
    }),
  ]);
  if (!employee?.isActive) return error(400, "INVALID_EMPLOYEE", "Employee not found or inactive");
  if (tasks.length !== taskIds.length) return error(400, "TASK_NOT_FOUND", "One or more tasks do not exist");
  if (tasks.some((task) => task.currentAssigneeId)) {
    return error(409, "TASK_ALREADY_ASSIGNED", "Only unassigned tasks can be assigned in this flow");
  }

  const assignedAt = new Date();
  await prisma.$transaction(async (tx) => {
    for (const task of tasks) {
      await tx.task.update({ where: { id: task.id }, data: { currentAssigneeId: employeeId } });
      await tx.taskAssignmentHistory.create({
        data: {
          taskId: task.id,
          employeeId,
          assignedById: user.id,
          assignedFrom: assignedAt,
          reason: reason || null,
        },
      });
      await tx.taskChangeLog.create({
        data: {
          taskId: task.id,
          changedById: user.id,
          fieldName: "currentAssignee",
          oldValue: null,
          newValue: employeeId,
        },
      });
    }
  });

  const overlaps = [];
  for (const task of tasks) {
    const taskOverlaps = await checkOverlap(employeeId, task.plannedStartDate, task.plannedEndDate, task.id);
    if (taskOverlaps.length > 0) overlaps.push({ taskId: task.id, count: taskOverlaps.length });
  }

  return NextResponse.json({ success: true, data: { assigned: tasks.length, overlaps } });
}
