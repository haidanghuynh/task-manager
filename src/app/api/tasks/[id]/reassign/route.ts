import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, getVisibleEmployeeIds } from "@/lib/auth/current-user";
import { reassignTaskSchema } from "@/lib/validation/task";
import { reassignTask } from "@/services/task.service";
import { hasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ success: false, error: { code: "UNAUTHORIZED" } }, { status: 401 });
  }
  if (!hasPermission(user, "TASK_ASSIGN")) {
    return NextResponse.json({ success: false, error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const parsed = reassignTaskSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: { code: "VALIDATION_ERROR", details: parsed.error.flatten().fieldErrors } },
      { status: 400 },
    );
  }

  const { id } = await params;
  if (user.role === "EMPLOYEE") {
    const [task, visibleEmployeeIds] = await Promise.all([
      prisma.task.findUnique({ where: { id }, select: { currentAssigneeId: true } }),
      getVisibleEmployeeIds(user),
    ]);
    if (!task?.currentAssigneeId || !visibleEmployeeIds?.includes(task.currentAssigneeId) || !visibleEmployeeIds.includes(parsed.data.employeeId)) {
      return NextResponse.json({ success: false, error: { code: "FORBIDDEN" } }, { status: 403 });
    }
  }

  try {
    const result = await reassignTask(
      id,
      parsed.data.employeeId,
      user.id,
      parsed.data.reason,
    );
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to reassign task";
    const status = message === "Task not found" ? 404 : 400;
    return NextResponse.json(
      { success: false, error: { code: status === 404 ? "NOT_FOUND" : "VALIDATION_ERROR", message } },
      { status },
    );
  }
}
