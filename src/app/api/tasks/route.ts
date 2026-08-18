import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getCurrentUser, getVisibleEmployeeIds } from "@/lib/auth/current-user";
import { prisma } from "@/lib/prisma";
import { buildTaskCode, checkOverlap } from "@/services/task.service";
import { createTaskSchema } from "@/lib/validation/task";
import { hasPermission } from "@/lib/permissions";
import { getBusinessDateBoundary } from "@/lib/date";
import { randomUUID } from "node:crypto";
import { recordAuditLog } from "@/lib/audit-log";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ success: false, error: { code: "UNAUTHORIZED", message: "Unauthorized" } }, { status: 401 });
  }

  const role = user.role;
  const visibleEmployeeIds = await getVisibleEmployeeIds(user);

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, Number.parseInt(searchParams.get("page") || "1", 10) || 1);
  const pageSize = Math.min(100, Math.max(1, Number.parseInt(searchParams.get("pageSize") || "20", 10) || 20));
  const search = searchParams.get("search") || "";
  const status = searchParams.get("status") || "";
  const product = searchParams.get("product") || "";
  const workType = searchParams.get("workType") || "";
  const employee = searchParams.get("employee") || "";
  const priority = searchParams.get("priority") || "";
  const startDate = searchParams.get("startDate") || "";
  const endDate = searchParams.get("endDate") || "";
  const teamId = searchParams.get("teamId") || "";
  const assignment = searchParams.get("assignment") || "";
  const groupBy = searchParams.get("groupBy") || ""; // "assignee" to group by employee
  const overdueOnly = searchParams.get("overdue") === "true";
  const showDeleted = searchParams.get("showDeleted") === "true";

  const where: Prisma.TaskWhereInput = {};

  if (!showDeleted) {
    where.deletedAt = null;
  }

  if (role === "EMPLOYEE") {
    where.currentAssigneeId = assignment === "unassigned" && hasPermission(user, "TASK_ASSIGN")
      ? null
      : employee && visibleEmployeeIds?.includes(employee)
        ? employee
        : { in: visibleEmployeeIds ?? [] };
  }
  if (!hasPermission(user, "TASK_VIEW")) {
    return NextResponse.json({ success: false, error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  if (employee && (role === "ADMIN" || role === "MANAGER")) {
    where.currentAssigneeId = employee;
  }

  if (status) where.status = status;
  if (product) where.productId = product;
  if (workType === "PRODUCT" || workType === "DAILY") where.workType = workType;
  if (priority) where.priority = priority;
  if (hasPermission(user, "TASK_ASSIGN") && assignment === "unassigned") where.currentAssigneeId = null;
  if (hasPermission(user, "TASK_ASSIGN") && assignment === "assigned" && role !== "EMPLOYEE") where.currentAssigneeId = { not: null };

  if (search) {
    where.OR = [
      { taskCode: { contains: search } },
      { taskName: { contains: search } },
    ];
  }

  // A task belongs to the selected period when its planned range overlaps it.
  if (startDate) {
    const parsedStart = new Date(`${startDate}T00:00:00.000Z`);
    if (!Number.isNaN(parsedStart.getTime())) where.plannedEndDate = { gte: parsedStart };
  }
  if (endDate) {
    const parsedEnd = new Date(`${endDate}T23:59:59.999Z`);
    if (!Number.isNaN(parsedEnd.getTime())) where.plannedStartDate = { lte: parsedEnd };
  }
  if (teamId && (role === "ADMIN" || role === "MANAGER")) {
    const teamMembers = await prisma.employee.findMany({ where: { teamId }, select: { id: true } });
    where.currentAssigneeId = { in: teamMembers.map((e: any) => e.id) };
    if (teamMembers.length === 0) where.currentAssigneeId = "none";
  }

  if (overdueOnly) {
    where.status = { notIn: ["COMPLETED", "CANCELLED", "WAITING"] };
    where.AND = [...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []), { workType: "PRODUCT" }];
    where.plannedEndDate = {
      ...(where.plannedEndDate as Prisma.DateTimeFilter | undefined),
      lt: getBusinessDateBoundary(),
    };
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

  try {
    const parsed = createTaskSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: { code: "VALIDATION_ERROR", details: parsed.error.flatten().fieldErrors } },
        { status: 400 },
      );
    }
    const {
      taskName, description, workType, dailyCategory, productId, taskNumber,
      assigneeId: requestedAssigneeId, assigneeIds: requestedAssigneeIds,
      plannedStartDate: start, plannedEndDate, plannedStartTime, plannedEndTime, status, priority, note,
    } = parsed.data;
    const createPermission = workType === "DAILY" ? "DAILY_TASK_CREATE" : "TASK_CREATE";
    if (!hasPermission(user, createPermission)) {
      return NextResponse.json({ success: false, error: { code: "FORBIDDEN", message: "Permission denied" } }, { status: 403 });
    }
    const canAssignTask = hasPermission(user, "TASK_ASSIGN");
    const canAssignDailyWithinTeam = workType === "DAILY" && user.role === "MANAGER";
    const canChooseAssignees = canAssignTask || canAssignDailyWithinTeam;
    if (!canChooseAssignees && !user.employeeId) {
      return NextResponse.json({ success: false, error: { code: "EMPLOYEE_REQUIRED", message: "Account is not linked to an employee" } }, { status: 400 });
    }
    if (workType !== "DAILY" && requestedAssigneeIds.length > 0) {
      return NextResponse.json(
        { success: false, error: { code: "VALIDATION_ERROR", message: "Multiple assignees are only supported for daily work" } },
        { status: 400 },
      );
    }

    const submittedAssigneeIds = workType === "DAILY" && requestedAssigneeIds.length > 0
      ? requestedAssigneeIds
      : requestedAssigneeId ? [requestedAssigneeId] : [];
    let assigneeIds = [...new Set(submittedAssigneeIds)];

    if (!canChooseAssignees) {
      assigneeIds = user.employeeId ? [user.employeeId] : [];
    } else if (workType === "DAILY" && user.role === "EMPLOYEE") {
      if (!user.employeeId || assigneeIds.some((employeeId) => employeeId !== user.employeeId)) {
        return NextResponse.json({ success: false, error: { code: "FORBIDDEN", message: "Employees can only create daily work for themselves" } }, { status: 403 });
      }
      assigneeIds = [user.employeeId];
    }

    if (workType === "DAILY" && user.role === "MANAGER" && !user.teamId) {
      return NextResponse.json({ success: false, error: { code: "FORBIDDEN", message: "Manager is not linked to a team" } }, { status: 403 });
    }
    if (canAssignDailyWithinTeam && !canAssignTask && assigneeIds.length === 0) {
      return NextResponse.json(
        { success: false, error: { code: "ASSIGNEE_REQUIRED", message: "Select at least one member of the manager's team" } },
        { status: 400 },
      );
    }

    if (assigneeIds.length > 0) {
      const allowedEmployees = await prisma.employee.findMany({
        where: {
          id: { in: assigneeIds },
          isActive: true,
          ...(workType === "DAILY" && user.role === "MANAGER" ? { teamId: user.teamId } : {}),
        },
        select: { id: true },
      });
      if (allowedEmployees.length !== assigneeIds.length) {
        return NextResponse.json({ success: false, error: { code: "FORBIDDEN", message: "One or more assignees are outside the permitted team" } }, { status: 403 });
      }
    }

    if (user.role === "EMPLOYEE" && assigneeIds.length > 0) {
      const visibleEmployeeIds = await getVisibleEmployeeIds(user);
      if (assigneeIds.some((employeeId) => !visibleEmployeeIds?.includes(employeeId))) {
        return NextResponse.json({ success: false, error: { code: "FORBIDDEN", message: "Permission denied" } }, { status: 403 });
      }
    }

    const product = workType === "PRODUCT"
      ? await prisma.product.findUnique({ where: { id: productId } })
      : null;
    if (workType === "PRODUCT" && !product?.isActive) {
      return NextResponse.json({ success: false, error: { code: "VALIDATION_ERROR", message: "Product not found or inactive" } }, { status: 400 });
    }

    const end = plannedEndDate ?? start;

    const taskCode = buildTaskCode(product?.code || "DAILY", taskNumber);
    const overlapGroups = await Promise.all(
      assigneeIds.map(async (employeeId) => ({ employeeId, tasks: await checkOverlap(employeeId, start, end) })),
    );
    const overlaps = overlapGroups.flatMap(({ employeeId, tasks }) =>
      tasks.map((overlap) => ({ ...overlap, overlapForEmployeeId: employeeId })),
    );
    const assignmentGroupId = assigneeIds.length > 1 ? randomUUID() : null;
    const taskAssignees: Array<string | null> = assigneeIds.length > 0 ? assigneeIds : [null];

    const tasks = await prisma.$transaction(async (tx) => {
      const createdTasks = [];
      for (const assigneeId of taskAssignees) {
        const created = await tx.task.create({
          data: {
            taskCode,
            taskName,
            description: description || null,
            workType,
            dailyCategory: workType === "DAILY" ? dailyCategory : null,
            productId: workType === "PRODUCT" ? productId : null,
            currentAssigneeId: assigneeId,
            assignmentGroupId,
            createdById: user.id,
            plannedStartDate: start,
            plannedEndDate: end,
            plannedStartTime: workType === "DAILY" ? plannedStartTime || null : null,
            plannedEndTime: workType === "DAILY" ? plannedEndTime || null : null,
            status,
            progress: status === "COMPLETED" ? 100 : 0,
            actualEndDate: status === "COMPLETED" ? new Date() : null,
            priority,
            note: note || null,
          },
        });
        if (assigneeId) {
          await tx.taskAssignmentHistory.create({
            data: { taskId: created.id, employeeId: assigneeId, assignedById: user.id, assignedFrom: start },
          });
        }
        await tx.taskStatusHistory.create({
          data: { taskId: created.id, oldStatus: "PLANNED", newStatus: status, changedById: user.id },
        });
        createdTasks.push(created);
      }
      return createdTasks;
    });

    await recordAuditLog({
      request: req,
      actor: user,
      action: "CREATE",
      entityType: "TASK",
      entityId: tasks[0].id,
      entityLabel: taskCode,
      details: { taskIds: tasks.map((task) => task.id), taskName, workType, assigneeIds, assignmentGroupId },
    });

    return NextResponse.json({
      success: true,
      data: { task: tasks[0], tasks, assignmentGroupId, overlaps },
      message: tasks.length > 1 ? `${tasks.length} linked tasks created successfully` : "Task created successfully",
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
