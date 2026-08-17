import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/lib/permissions";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ success: false, error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const { content } = body;

  if (typeof content !== "string" || !content.trim() || content.length > 5000) {
    return NextResponse.json({ success: false, error: { code: "VALIDATION_ERROR", message: "Content required" } }, { status: 400 });
  }

  const task = await prisma.task.findUnique({ where: { id } });
  if (!task) return NextResponse.json({ success: false, error: { code: "NOT_FOUND" } }, { status: 404 });

  if (user.role === "EMPLOYEE" && task.currentAssigneeId !== user.employeeId) {
    return NextResponse.json({ success: false, error: { code: "FORBIDDEN" } }, { status: 403 });
  }
  const commentingOwnTask = task.currentAssigneeId === user.employeeId;
  const editPermission = task.workType === "DAILY" ? "DAILY_TASK_EDIT" : "TASK_EDIT";
  if (!hasPermission(user, editPermission) && !(commentingOwnTask && hasPermission(user, "TASK_UPDATE_OWN"))) {
    return NextResponse.json({ success: false, error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const comment = await prisma.taskComment.create({
    data: { taskId: id, authorId: user.id, content: content.trim() },
    include: { author: { select: { id: true, name: true } } },
  });

  return NextResponse.json({ success: true, data: comment }, { status: 201 });
}
