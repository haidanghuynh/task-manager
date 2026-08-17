import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, getVisibleEmployeeIds } from "@/lib/auth/current-user";
import { unassignTaskSchema } from "@/lib/validation/task";
import { unassignTask } from "@/services/task.service";
import { hasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { recordAuditLog } from "@/lib/audit-log";

function error(status: number, code: string, message?: string) {
  return NextResponse.json({ success: false, error: { code, message } }, { status });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return error(401, "UNAUTHORIZED");
  if (!hasPermission(user, "TASK_ASSIGN")) return error(403, "FORBIDDEN");

  const parsed = unassignTaskSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return error(400, "VALIDATION_ERROR", "Reason must not exceed 1000 characters");
  }

  const { id } = await params;
  if (user.role === "EMPLOYEE") {
    const [task, visibleEmployeeIds] = await Promise.all([
      prisma.task.findUnique({ where: { id }, select: { currentAssigneeId: true } }),
      getVisibleEmployeeIds(user),
    ]);
    if (!task?.currentAssigneeId || !visibleEmployeeIds?.includes(task.currentAssigneeId)) return error(403, "FORBIDDEN");
  }

  try {
    const result = await unassignTask(id, user.id, parsed.data.reason);
    await recordAuditLog({ request: req, actor: user, action: "UNASSIGN", entityType: "TASK", entityId: id, details: { reason: parsed.data.reason || null } });
    return NextResponse.json({ success: true, data: result });
  } catch (caught: unknown) {
    const message = caught instanceof Error ? caught.message : "Unable to return task to waiting queue";
    const status = message === "Task not found" ? 404 : 409;
    return error(status, status === 404 ? "NOT_FOUND" : "INVALID_STATE", message);
  }
}
