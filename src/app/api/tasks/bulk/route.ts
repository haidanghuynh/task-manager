import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/prisma";

const statuses = new Set(["PLANNED", "IN_PROGRESS", "WAITING", "COMPLETED", "CANCELLED"]);
const priorities = new Set(["LOW", "MEDIUM", "HIGH", "URGENT"]);

function parseDate(value: string): Date | null {
  if (!value.trim()) return null;
  const date = new Date(value.trim());
  return Number.isNaN(date.getTime()) ? null : date;
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ success: false, error: { code: "UNAUTHORIZED" } }, { status: 401 });
  if (user.role !== "ADMIN" && user.role !== "MANAGER") {
    return NextResponse.json({ success: false, error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const rows: unknown[] = Array.isArray(body?.rows) ? body.rows : [];
  if (rows.length === 0 || rows.length > 1000) {
    return NextResponse.json(
      { success: false, error: { code: "VALIDATION_ERROR", message: "CSV must contain 1-1000 rows" } },
      { status: 400 },
    );
  }

  const [products, employees] = await Promise.all([
    prisma.product.findMany({ where: { isActive: true }, select: { id: true, code: true } }),
    prisma.employee.findMany({ where: { isActive: true }, select: { id: true, employeeCode: true } }),
  ]);
  const productByCode = new Map(products.map((product) => [product.code.toLowerCase(), product]));
  const employeeGroups = new Map<string, Array<{ id: string; employeeCode: string }>>();
  for (const employee of employees) {
    const key = employee.employeeCode.toLowerCase();
    employeeGroups.set(key, [...(employeeGroups.get(key) || []), employee]);
  }

  let imported = 0;
  const errors: Array<{ row: number; reason: string }> = [];
  for (let index = 0; index < rows.length; index++) {
    const rawRow = rows[index];
    const values: string[] = Array.isArray(rawRow)
      ? rawRow.map((value: unknown) => String(value ?? "").trim())
      : [];
    const [requestedCode, taskName, description, productCode, assigneeCode, startValue, endValue,
      actualStartValue, actualEndValue, statusValue, progressValue, priorityValue, note] = values;
    const rowNumber = index + 2;
    const product = productByCode.get((productCode || "").toLowerCase());
    const employeeMatches = employeeGroups.get((assigneeCode || "").toLowerCase()) || [];
    const start = parseDate(startValue || "");
    const end = parseDate(endValue || "");
    const actualStart = parseDate(actualStartValue || "");
    const actualEnd = parseDate(actualEndValue || "");
    const status = (statusValue || "PLANNED").toUpperCase();
    const priority = (priorityValue || "MEDIUM").toUpperCase();
    const progress = progressValue === "" || progressValue === undefined ? (status === "COMPLETED" ? 100 : 0) : Number(progressValue);

    let reason = "";
    if (!taskName || taskName.length > 200) reason = "Invalid task name";
    else if (!product) reason = `Product code not found: ${productCode || "(empty)"}`;
    else if (employeeMatches.length !== 1) reason = employeeMatches.length > 1 ? `Employee code is duplicated: ${assigneeCode}` : `Employee code not found: ${assigneeCode || "(empty)"}`;
    else if (!start || !end || end < start) reason = "Invalid planned date range";
    else if ((actualStartValue && !actualStart) || (actualEndValue && !actualEnd)) reason = "Invalid actual date";
    else if (!statuses.has(status)) reason = `Invalid status: ${status}`;
    else if (!priorities.has(priority)) reason = `Invalid priority: ${priority}`;
    else if (!Number.isInteger(progress) || progress < 0 || progress > 100) reason = "Progress must be an integer from 0 to 100";
    else if (!requestedCode) reason = "Task code is required";
    else if (!/^[A-Za-z0-9._-]{1,100}$/.test(requestedCode)) reason = "Invalid task code";

    if (reason) {
      errors.push({ row: rowNumber, reason });
      continue;
    }

    try {
      const taskCode = requestedCode;
      await prisma.$transaction(async (tx) => {
        const task = await tx.task.create({
          data: {
            taskCode, taskName, description: description || null, productId: product!.id,
            currentAssigneeId: employeeMatches[0].id, createdById: user.id,
            plannedStartDate: start!, plannedEndDate: end!,
            actualStartDate: actualStart ?? (status !== "PLANNED" ? start : null),
            actualEndDate: actualEnd ?? (status === "COMPLETED" ? end : null),
            status, progress, priority, note: note || null,
          },
        });
        await tx.taskAssignmentHistory.create({
          data: { taskId: task.id, employeeId: employeeMatches[0].id, assignedById: user.id, assignedFrom: start! },
        });
        await tx.taskStatusHistory.create({
          data: { taskId: task.id, oldStatus: "PLANNED", newStatus: status, changedById: user.id },
        });
      });
      imported++;
    } catch (caught: unknown) {
      const reason = caught instanceof Prisma.PrismaClientKnownRequestError && caught.code === "P2002"
        ? "Task code already exists"
        : "Database error";
      errors.push({ row: rowNumber, reason });
    }
  }

  return NextResponse.json({ success: true, data: { imported, skipped: errors.length, errors: errors.slice(0, 50) } });
}

export async function DELETE() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ success: false, error: { code: "UNAUTHORIZED" } }, { status: 401 });
  if (user.role !== "ADMIN") {
    return NextResponse.json({ success: false, error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  // Soft delete all tasks
  const result = await prisma.task.updateMany({ where: { deletedAt: null }, data: { deletedAt: new Date() } });
  return NextResponse.json({ success: true, message: `Deleted ${result.count} tasks` });
}
