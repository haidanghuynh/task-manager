import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/prisma";
import { buildTaskCode, checkOverlap } from "@/services/task.service";
import { createTaskSchema } from "@/lib/validation/task";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ success: false, error: { code: "UNAUTHORIZED", message: "Unauthorized" } }, { status: 401 });
  }

  const role = user.role;
  const employeeId = user.employeeId;

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, Number.parseInt(searchParams.get("page") || "1", 10) || 1);
  const pageSize = Math.min(100, Math.max(1, Number.parseInt(searchParams.get("pageSize") || "20", 10) || 20));
  const search = searchParams.get("search") || "";
  const status = searchParams.get("status") || "";
  const product = searchParams.get("product") || "";
  const employee = searchParams.get("employee") || "";
  const priority = searchParams.get("priority") || "";
  const startDate = searchParams.get("startDate") || "";
  const endDate = searchParams.get("endDate") || "";
  const teamId = searchParams.get("teamId") || "";
  const groupBy = searchParams.get("groupBy") || ""; // "assignee" to group by employee
  const overdueOnly = searchParams.get("overdue") === "true";
  const showDeleted = searchParams.get("showDeleted") === "true";

  const where: Prisma.TaskWhereInput = {};

  if (!showDeleted) {
    where.deletedAt = null;
  }

  if (role === "EMPLOYEE") {
    where.currentAssigneeId = employeeId;
  }

  if (employee && (role === "ADMIN" || role === "MANAGER")) {
    where.currentAssigneeId = employee;
  }

  if (status) where.status = status;
  if (product) where.productId = product;
  if (priority) where.priority = priority;

  if (search) {
    where.OR = [
      { taskCode: { contains: search } },
      { taskName: { contains: search } },
    ];
  }

  const plannedStartDateFilter: Prisma.DateTimeFilter = {};
  if (startDate) plannedStartDateFilter.gte = new Date(startDate);
  if (endDate) plannedStartDateFilter.lte = new Date(endDate);
  if (startDate || endDate) where.plannedStartDate = plannedStartDateFilter;
  if (teamId) {
    const teamMembers = await prisma.employee.findMany({ where: { teamId }, select: { id: true } });
    where.currentAssigneeId = { in: teamMembers.map((e: any) => e.id) };
    if (teamMembers.length === 0) where.currentAssigneeId = "none";
  }

  if (overdueOnly) {
    where.status = { notIn: ["COMPLETED", "CANCELLED"] };
    where.plannedEndDate = { lt: new Date() };
  }

  if (groupBy === "assignee" || groupBy === "team") {
    // Fetch all tasks matching filters
    const allTasks = await prisma.task.findMany({
      where,
      include: {
        product: true,
        currentAssignee: { include: { team: { include: { lead: true } } } },
        createdBy: { select: { id: true, name: true } },
      },
      orderBy: { plannedStartDate: "asc" },
    });

    if (groupBy === "team") {
      // Group by team → assignee → tasks
      const teamMap: Record<string, { team: any; assignees: Record<string, { employee: any; tasks: any[]; count: number; inProgress: number; planned: number; completed: number }> }> = {};
      const noTeamKey = "__no_team__";

      for (const t of allTasks) {
        const teamKey = t.currentAssignee?.teamId || noTeamKey;
        const teamName = t.currentAssignee?.team?.name || "Chưa có nhóm";

        if (!teamMap[teamKey]) {
          teamMap[teamKey] = { team: { id: teamKey, name: teamName, lead: t.currentAssignee?.team?.lead }, assignees: {} };
        }

        const assigneeKey = t.currentAssigneeId || "unassigned";
        if (!teamMap[teamKey].assignees[assigneeKey]) {
          teamMap[teamKey].assignees[assigneeKey] = {
            employee: t.currentAssignee || { fullName: "Chưa phân công", employeeCode: "-" },
            tasks: [],
            count: 0,
            inProgress: 0,
            planned: 0,
            completed: 0,
          };
        }
        const ag = teamMap[teamKey].assignees[assigneeKey];
        ag.tasks.push(t);
        ag.count++;
        if (t.status === "IN_PROGRESS") ag.inProgress++;
        if (t.status === "PLANNED") ag.planned++;
        if (t.status === "COMPLETED") ag.completed++;
      }

      // Convert to sorted array: teams with assignees
      const result = Object.values(teamMap).map(tm => ({
        ...tm,
        assignees: Object.values(tm.assignees).sort((a, b) => a.employee.fullName.localeCompare(b.employee.fullName)),
        totalTasks: Object.values(tm.assignees).reduce((sum, a) => sum + a.count, 0),
      })).sort((a, b) => a.team.name.localeCompare(b.team.name));

      return NextResponse.json({
        success: true,
        data: {
          tasks: result,
          grouped: "team",
          pagination: { page: 1, pageSize: 100, total: allTasks.length, totalPages: 1 },
        },
      });
    }

    // groupBy === "assignee" - Group by assignee
    const grouped: Record<string, { employee: any; tasks: any[]; count: number; inProgress: number; planned: number; completed: number }> = {};
    for (const t of allTasks) {
      const key = t.currentAssigneeId || "unassigned";
      if (!grouped[key]) {
        grouped[key] = {
          employee: t.currentAssignee || { fullName: "Chưa phân công", employeeCode: "-" },
          tasks: [],
          count: 0,
          inProgress: 0,
          planned: 0,
          completed: 0,
        };
      }
      grouped[key].tasks.push(t);
      grouped[key].count++;
      if (t.status === "IN_PROGRESS") grouped[key].inProgress++;
      if (t.status === "PLANNED") grouped[key].planned++;
      if (t.status === "COMPLETED") grouped[key].completed++;
    }

    return NextResponse.json({
      success: true,
      data: {
        tasks: Object.values(grouped).sort((a, b) => a.employee.fullName.localeCompare(b.employee.fullName)),
        grouped: "assignee",
        pagination: { page: 1, pageSize: 100, total: allTasks.length, totalPages: 1 },
      },
    });
  }

  const [tasks, total] = await Promise.all([
    prisma.task.findMany({
      where,
      include: {
        product: true,
        currentAssignee: true,
        createdBy: { select: { id: true, name: true } },
      },
      orderBy: { plannedStartDate: "asc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.task.count({ where }),
  ]);

  return NextResponse.json({
    success: true,
    data: {
      tasks,
      grouped: false,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    },
  });
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ success: false, error: { code: "UNAUTHORIZED", message: "Unauthorized" } }, { status: 401 });
  }

  if (user.role !== "ADMIN" && user.role !== "MANAGER") {
    return NextResponse.json({ success: false, error: { code: "FORBIDDEN", message: "Permission denied" } }, { status: 403 });
  }

  try {
    const parsed = createTaskSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: { code: "VALIDATION_ERROR", details: parsed.error.flatten().fieldErrors } },
        { status: 400 },
      );
    }
    const { taskName, description, productId, taskNumber, assigneeId, plannedStartDate: start, plannedEndDate, status, priority, note } = parsed.data;

    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product?.isActive) {
      return NextResponse.json({ success: false, error: { code: "VALIDATION_ERROR", message: "Product not found or inactive" } }, { status: 400 });
    }

    // Check employee active
    const employee = await prisma.employee.findUnique({ where: { id: assigneeId } });
    if (!employee || !employee.isActive) {
      return NextResponse.json({ success: false, error: { code: "VALIDATION_ERROR", message: "Employee not found or inactive" } }, { status: 400 });
    }

    const end = plannedEndDate ?? start;

    const taskCode = buildTaskCode(product.code, taskNumber);
    const overlaps = await checkOverlap(assigneeId, start, end);

    const task = await prisma.$transaction(async (tx) => {
      const created = await tx.task.create({
        data: {
          taskCode,
          taskName,
          description: description || null,
          productId,
          currentAssigneeId: assigneeId,
          createdById: user.id,
          plannedStartDate: start,
          plannedEndDate: end,
          status,
          progress: status === "COMPLETED" ? 100 : 0,
          actualEndDate: status === "COMPLETED" ? new Date() : null,
          priority,
          note: note || null,
        },
      });
      await tx.taskAssignmentHistory.create({
        data: { taskId: created.id, employeeId: assigneeId, assignedById: user.id, assignedFrom: start },
      });
      await tx.taskStatusHistory.create({
        data: { taskId: created.id, oldStatus: "PLANNED", newStatus: status, changedById: user.id },
      });
      return created;
    });

    return NextResponse.json({
      success: true,
      data: { task, overlaps },
      message: "Task created successfully",
    }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "TASK_CODE_EXISTS",
            message: "Mã task đã tồn tại. Vui lòng nhập phần mã phía sau khác; nếu đang để trống, hãy nhập thêm phần phía sau.",
          },
        },
        { status: 409 },
      );
    }
    console.error("Failed to create task", error);
    return NextResponse.json({ success: false, error: { code: "SERVER_ERROR", message: "Unable to create task" } }, { status: 500 });
  }
}
