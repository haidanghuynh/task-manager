import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export function buildTaskCode(productCode: string, taskNumber?: string): string {
  const prefix = productCode;
  const number = taskNumber?.trim();

  if (!number) return prefix;

  return `${prefix}-${number}`;
}

export async function checkOverlap(
  employeeId: string,
  startDate: Date,
  endDate: Date,
  excludeTaskId?: string
) {
  const where: Prisma.TaskWhereInput = {
    currentAssigneeId: employeeId,
    deletedAt: null,
    status: { notIn: ["CANCELLED"] },
    plannedStartDate: { lte: endDate },
    plannedEndDate: { gte: startDate },
  };

  if (excludeTaskId) {
    where.id = { not: excludeTaskId };
  }

  const overlapping = await prisma.task.findMany({
    where,
    include: {
      product: true,
      currentAssignee: true,
    },
  });

  return overlapping;
}

export async function reassignTask(
  taskId: string,
  newEmployeeId: string,
  assignedById: string,
  reason: string
) {
  const task = await prisma.$transaction(async (tx) => {
    const existing = await tx.task.findUnique({ where: { id: taskId } });
    if (!existing || existing.deletedAt) throw new Error("Task not found");
    if (existing.currentAssigneeId === newEmployeeId) {
      throw new Error("Task is already assigned to this employee");
    }

    const employee = await tx.employee.findUnique({ where: { id: newEmployeeId } });
    if (!employee?.isActive) throw new Error("Employee not found or inactive");

    const now = new Date();
    await tx.taskAssignmentHistory.updateMany({
      where: { taskId, assignedUntil: null },
      data: { assignedUntil: now, reason: reason || null },
    });
    await tx.taskAssignmentHistory.create({
      data: { taskId, employeeId: newEmployeeId, assignedById, assignedFrom: now },
    });
    await tx.task.update({ where: { id: taskId }, data: { currentAssigneeId: newEmployeeId } });
    await tx.taskChangeLog.create({
      data: {
        taskId,
        changedById: assignedById,
        fieldName: "currentAssignee",
        oldValue: existing.currentAssigneeId,
        newValue: newEmployeeId,
      },
    });
    return existing;
  });

  // 5. Check overlap for new employee
  const overlaps = await checkOverlap(
    newEmployeeId,
    task.plannedStartDate,
    task.plannedEndDate,
    taskId
  );

  return { overlaps };
}

export async function unassignTask(
  taskId: string,
  changedById: string,
  reason: string,
) {
  return prisma.$transaction(async (tx) => {
    const task = await tx.task.findUnique({ where: { id: taskId } });
    if (!task || task.deletedAt) throw new Error("Task not found");
    if (!task.currentAssigneeId) throw new Error("Task is already unassigned");
    if (task.status === "COMPLETED" || task.status === "CANCELLED") {
      throw new Error("Completed or cancelled tasks cannot be returned to the waiting queue");
    }

    const now = new Date();
    await tx.taskAssignmentHistory.updateMany({
      where: { taskId, assignedUntil: null },
      data: { assignedUntil: now, reason: reason || null },
    });
    await tx.task.update({
      where: { id: taskId },
      data: { currentAssigneeId: null },
    });
    await tx.taskChangeLog.create({
      data: {
        taskId,
        changedById,
        fieldName: "currentAssignee",
        oldValue: task.currentAssigneeId,
        newValue: null,
      },
    });

    return { taskId };
  });
}

export async function updateTaskStatus(
  taskId: string,
  newStatus: string,
  changedById: string,
  note?: string
) {
  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task) throw new Error("Task not found");

  const oldStatus = task.status;

  const updateData: any = { status: newStatus };
  if (newStatus === "COMPLETED") {
    updateData.progress = 100;
    if (!task.actualEndDate) {
      updateData.actualEndDate = new Date();
    }
  }

  await prisma.task.update({
    where: { id: taskId },
    data: updateData,
  });

  await prisma.taskStatusHistory.create({
    data: {
      taskId,
      oldStatus,
      newStatus,
      changedById,
      note: note ?? null,
    },
  });

  if (oldStatus !== newStatus) {
    await prisma.taskChangeLog.create({
      data: {
        taskId,
        changedById,
        fieldName: "status",
        oldValue: oldStatus,
        newValue: newStatus,
      },
    });
  }
}
