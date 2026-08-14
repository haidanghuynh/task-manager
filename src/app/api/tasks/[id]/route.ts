import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getCurrentUser, getVisibleEmployeeIds } from "@/lib/auth/current-user";
import { prisma } from "@/lib/prisma";
import { checkOverlap } from "@/services/task.service";
import { updateTaskSchema } from "@/lib/validation/task";
import { hasPermission } from "@/lib/permissions";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ success: false, error: { code: "UNAUTHORIZED", message: "Unauthorized" } }, { status: 401 });
  }

  const { id } = await params;

  const task = await prisma.task.findUnique({
    where: { id },
    include: {
      product: true,
      currentAssignee: true,
      createdBy: { select: { id: true, name: true } },
      assignmentHistory: {
        include: {
          employee: true,
          assignedBy: { select: { id: true, name: true } },
        },
        orderBy: { assignedFrom: "desc" },
      },
      statusHistory: {
        include: {
          changedBy: { select: { id: true, name: true } },
        },
        orderBy: { changedAt: "desc" },
      },
      changeLogs: {
        include: {
          changedBy: { select: { id: true, name: true } },
        },
        orderBy: { changedAt: "desc" },
      },
      comments: {
        where: { deletedAt: null },
        include: {
          author: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!task || task.deletedAt) {
    return NextResponse.json({ success: false, error: { code: "NOT_FOUND", message: "Task not found" } }, { status: 404 });
  }

  // Check permission
  if (user.role === "EMPLOYEE") {
    const visibleEmployeeIds = await getVisibleEmployeeIds(user);
    if (!task.currentAssigneeId || !visibleEmployeeIds?.includes(task.currentAssigneeId)) {
      return NextResponse.json({ success: false, error: { code: "FORBIDDEN", message: "Permission denied" } }, { status: 403 });
    }
  }
  if (!hasPermission(user, "TASK_VIEW")) {
    return NextResponse.json({ success: false, error: { code: "FORBIDDEN", message: "Permission denied" } }, { status: 403 });
  }

  return NextResponse.json({ success: true, data: task });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ success: false, error: { code: "UNAUTHORIZED", message: "Unauthorized" } }, { status: 401 });
  }

  const { id } = await params;

  const task = await prisma.task.findUnique({ where: { id } });
  if (!task || task.deletedAt) {
    return NextResponse.json({ success: false, error: { code: "NOT_FOUND", message: "Task not found" } }, { status: 404 });
  }

  // Employee can only update own tasks' progress, status, actual dates, note
  if (user.role === "EMPLOYEE") {
    const visibleEmployeeIds = await getVisibleEmployeeIds(user);
    if (!task.currentAssigneeId || !visibleEmployeeIds?.includes(task.currentAssigneeId)) {
      return NextResponse.json({ success: false, error: { code: "FORBIDDEN", message: "Permission denied" } }, { status: 403 });
    }
  }

  const updatingOwnTask = task.currentAssigneeId === user.employeeId;
  const canEditTask = hasPermission(user, "TASK_EDIT");
  if (!canEditTask && !(updatingOwnTask && hasPermission(user, "TASK_UPDATE_OWN"))) {
    return NextResponse.json({ success: false, error: { code: "FORBIDDEN", message: "Permission denied" } }, { status: 403 });
  }

  try {
    const parsed = updateTaskSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: { code: "VALIDATION_ERROR", details: parsed.error.flatten().fieldErrors } },
        { status: 400 },
      );
    }

    const employeeFields = new Set(["progress", "status", "actualStartDate", "actualEndDate", "note"]);
    const updateData: Prisma.TaskUncheckedUpdateInput = {};
    for (const [field, value] of Object.entries(parsed.data)) {
      if (!canEditTask && !employeeFields.has(field)) continue;
      (updateData as Record<string, unknown>)[field] = value;
    }

    const plannedStart = (updateData.plannedStartDate as Date | undefined) ?? task.plannedStartDate;
    const plannedEnd = (updateData.plannedEndDate as Date | undefined) ?? task.plannedEndDate;
    if (plannedEnd < plannedStart) {
      return NextResponse.json(
        { success: false, error: { code: "VALIDATION_ERROR", message: "End date cannot be before start date" } },
        { status: 400 },
      );
    }

    if (updateData.status === "COMPLETED") {
      updateData.progress = 100;
      if (!task.actualEndDate && updateData.actualEndDate === undefined) updateData.actualEndDate = new Date();
    }

    const finalWorkType = (updateData.workType as string | undefined) ?? task.workType;
    const finalProductId = updateData.productId === undefined ? task.productId : updateData.productId;
    const finalDailyCategory = updateData.dailyCategory === undefined ? task.dailyCategory : updateData.dailyCategory;

    if (finalWorkType === "PRODUCT" && typeof finalProductId === "string") {
      const product = await prisma.product.findUnique({ where: { id: finalProductId } });
      if (!product?.isActive) {
        return NextResponse.json(
          { success: false, error: { code: "VALIDATION_ERROR", message: "Product not found or inactive" } },
          { status: 400 },
        );
      }
    }

    if (finalWorkType === "PRODUCT" && !finalProductId) {
      return NextResponse.json(
        { success: false, error: { code: "VALIDATION_ERROR", message: "Product is required" } },
        { status: 400 },
      );
    }
    if (finalWorkType === "DAILY" && !finalDailyCategory) {
      return NextResponse.json(
        { success: false, error: { code: "VALIDATION_ERROR", message: "Daily work category is required" } },
        { status: 400 },
      );
    }
    if (finalWorkType === "DAILY") updateData.productId = null;
    if (finalWorkType === "PRODUCT") updateData.dailyCategory = null;

    const trackedFields = ["taskCode", "status", "progress", "priority", "plannedStartDate", "plannedEndDate", "actualEndDate", "workType", "dailyCategory", "productId"] as const;
    const changes = trackedFields.flatMap((field) => {
      const newValue = (updateData as Record<string, unknown>)[field];
      if (newValue === undefined) return [];
      const oldValue = (task as unknown as Record<string, unknown>)[field];
      if (String(oldValue ?? "") === String(newValue ?? "")) return [];
      return [{ field, oldValue, newValue }];
    });

    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.task.update({
        where: { id },
        data: updateData,
        include: { product: true, currentAssignee: true },
      });
      if (updateData.status && updateData.status !== task.status) {
        await tx.taskStatusHistory.create({
          data: { taskId: id, oldStatus: task.status, newStatus: updateData.status as string, changedById: user.id },
        });
      }
      if (changes.length > 0) {
        await tx.taskChangeLog.createMany({
          data: changes.map(({ field, oldValue, newValue }) => ({
            taskId: id,
            changedById: user.id,
            fieldName: field,
            oldValue: String(oldValue ?? ""),
            newValue: String(newValue ?? ""),
          })),
        });
      }
      return result;
    });

    // Check overlaps if dates or assignee changed
    let overlaps: any[] = [];
    if (updateData.plannedStartDate || updateData.plannedEndDate) {
      const start = plannedStart;
      const end = plannedEnd;
      if (task.currentAssigneeId) {
        overlaps = await checkOverlap(task.currentAssigneeId, start, end, id);
      }
    }

    return NextResponse.json({
      success: true,
      data: { task: updated, overlaps },
      message: "Task updated successfully",
    });
  } catch (error) {
    console.error("Failed to update task", error);
    return NextResponse.json({ success: false, error: { code: "SERVER_ERROR", message: "Unable to update task" } }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ success: false, error: { code: "UNAUTHORIZED", message: "Unauthorized" } }, { status: 401 });
  }

  const { id } = await params;

  if (!hasPermission(user, "TASK_DELETE")) {
    return NextResponse.json({ success: false, error: { code: "FORBIDDEN", message: "Permission denied" } }, { status: 403 });
  }

  if (user.role === "EMPLOYEE") {
    const task = await prisma.task.findUnique({ where: { id }, select: { currentAssigneeId: true } });
    const visibleEmployeeIds = await getVisibleEmployeeIds(user);
    if (!task?.currentAssigneeId || !visibleEmployeeIds?.includes(task.currentAssigneeId)) {
      return NextResponse.json({ success: false, error: { code: "FORBIDDEN", message: "Permission denied" } }, { status: 403 });
    }
  }

  // Soft delete
  await prisma.task.update({
    where: { id },
    data: { deletedAt: new Date() },
  });

  return NextResponse.json({ success: true, message: "Task deleted successfully" });
}
