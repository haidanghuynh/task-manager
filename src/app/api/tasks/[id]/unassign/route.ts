import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { unassignTaskSchema } from "@/lib/validation/task";
import { unassignTask } from "@/services/task.service";

function error(status: number, code: string, message?: string) {
  return NextResponse.json({ success: false, error: { code, message } }, { status });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return error(401, "UNAUTHORIZED");
  if (user.role !== "ADMIN" && user.role !== "MANAGER") return error(403, "FORBIDDEN");

  const parsed = unassignTaskSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return error(400, "VALIDATION_ERROR", "Reason must not exceed 1000 characters");
  }

  try {
    const { id } = await params;
    const result = await unassignTask(id, user.id, parsed.data.reason);
    return NextResponse.json({ success: true, data: result });
  } catch (caught: unknown) {
    const message = caught instanceof Error ? caught.message : "Unable to return task to waiting queue";
    const status = message === "Task not found" ? 404 : 409;
    return error(status, status === 404 ? "NOT_FOUND" : "INVALID_STATE", message);
  }
}
