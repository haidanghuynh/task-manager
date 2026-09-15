import "server-only";

import type { Prisma } from "@prisma/client";
import { getAiDailyCapacityHours } from "@/config/features";
import type { AppUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/prisma";

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

export const aiTools = [
  {
    type: "function" as const,
    function: {
      name: "get_available_members",
      description: "List active employees and estimate their availability for one date from timed daily work, absences, and active task counts.",
      parameters: {
        type: "object",
        properties: {
          date: { type: "string", description: "Date in YYYY-MM-DD format." },
          teamName: { type: "string", description: "Optional team name. Admin only; managers are always restricted to their own team." },
        },
        required: ["date"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_team_workload",
      description: "Summarize active task workload for employees over a date range.",
      parameters: {
        type: "object",
        properties: {
          startDate: { type: "string", description: "Start date in YYYY-MM-DD format." },
          endDate: { type: "string", description: "End date in YYYY-MM-DD format." },
          teamName: { type: "string", description: "Optional team name. Admin only; managers are always restricted to their own team." },
        },
        required: ["startDate", "endDate"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_schedule_conflicts",
      description: "Find overlapping timed daily tasks for active employees on one date.",
      parameters: {
        type: "object",
        properties: {
          date: { type: "string", description: "Date in YYYY-MM-DD format." },
          teamName: { type: "string", description: "Optional team name. Admin only; managers are always restricted to their own team." },
        },
        required: ["date"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_task_activity",
      description: "Search task activity by date range, product, employee, work type, status, and assignment. Use this for questions such as who is working on Gate on a date, what tasks a person has, product progress, or unassigned work.",
      parameters: {
        type: "object",
        properties: {
          startDate: { type: "string", description: "Start date in YYYY-MM-DD format." },
          endDate: { type: "string", description: "Optional end date in YYYY-MM-DD format; defaults to startDate." },
          product: { type: "string", description: "Optional product code or product name, for example GATE or Gate." },
          employee: { type: "string", description: "Optional employee code or full name." },
          workType: { type: "string", enum: ["PRODUCT", "DAILY"], description: "Optional work type." },
          statuses: {
            type: "array",
            items: { type: "string", enum: ["PLANNED", "IN_PROGRESS", "WAITING", "COMPLETED", "CANCELLED"] },
            description: "Optional statuses. When omitted, completed and cancelled tasks are excluded.",
          },
          assignment: { type: "string", enum: ["assigned", "unassigned", "any"], description: "Optional assignment filter; defaults to any within the authorized scope." },
          teamName: { type: "string", description: "Optional team name. Admin only; managers are always restricted to their own team." },
        },
        required: ["startDate"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_task_risks",
      description: "Find assigned active PRODUCT tasks that are overdue or due soon as of one date. Use this for deadline risk, late task, and upcoming due-date questions.",
      parameters: {
        type: "object",
        properties: {
          date: { type: "string", description: "Reference date in YYYY-MM-DD format." },
          dueWithinDays: { type: "integer", minimum: 0, maximum: 30, description: "Include tasks due from the reference date through this many days later; defaults to 7." },
          product: { type: "string", description: "Optional product code or name." },
          employee: { type: "string", description: "Optional employee code or full name." },
          teamName: { type: "string", description: "Optional team name. Admin only; managers are always restricted to their own team." },
        },
        required: ["date"],
        additionalProperties: false,
      },
    },
  },
];

type ToolArgs = Record<string, unknown>;

function parseDate(value: unknown, field: string) {
  if (typeof value !== "string" || !datePattern.test(value)) throw new Error(`${field} must use YYYY-MM-DD`);
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new Error(`${field} is invalid`);
  return date;
}

function endOfDate(value: string) {
  return new Date(`${value}T23:59:59.999Z`);
}

function minutes(value: string) {
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

function mergedMinutes(ranges: Array<[number, number]>) {
  const sorted = ranges.filter(([start, end]) => end > start).sort((a, b) => a[0] - b[0]);
  if (sorted.length === 0) return 0;
  let total = 0;
  let [currentStart, currentEnd] = sorted[0];
  for (const [start, end] of sorted.slice(1)) {
    if (start <= currentEnd) currentEnd = Math.max(currentEnd, end);
    else {
      total += currentEnd - currentStart;
      currentStart = start;
      currentEnd = end;
    }
  }
  return total + currentEnd - currentStart;
}

function normalizeLookup(value: string) {
  return value.normalize("NFKC").trim().toLocaleLowerCase();
}

function findUniqueMatch<T>(items: T[], query: string, values: (item: T) => string[]) {
  const requested = normalizeLookup(query);
  const exact = items.find((item) => values(item).some((value) => normalizeLookup(value) === requested));
  if (exact) return exact;
  const partial = items.filter((item) => values(item).some((value) => normalizeLookup(value).includes(requested)));
  if (partial.length === 1) return partial[0];
  if (partial.length > 1) throw new Error("The requested name is ambiguous; use the full name or code");
  return null;
}

async function resolveEmployeeScope(user: AppUser, teamNameValue: unknown) {
  let teamId: string | undefined;
  let teamName: string | undefined;

  if (user.role === "MANAGER") {
    if (!user.teamId) throw new Error("Manager account is not linked to a team");
    const team = await prisma.team.findUnique({ where: { id: user.teamId }, select: { id: true, name: true, isActive: true } });
    if (!team?.isActive) throw new Error("Manager team is inactive or unavailable");
    teamId = team.id;
    teamName = team.name;
  } else if (typeof teamNameValue === "string" && teamNameValue.trim()) {
    const teams = await prisma.team.findMany({ where: { isActive: true }, select: { id: true, name: true } });
    const team = findUniqueMatch(teams, teamNameValue, (item) => [item.name]);
    if (!team) throw new Error("Team not found");
    teamId = team.id;
    teamName = team.name;
  }

  const employees = await prisma.employee.findMany({
    where: { isActive: true, ...(teamId ? { teamId } : {}) },
    select: { id: true, employeeCode: true, fullName: true, teamId: true, team: { select: { name: true } } },
    orderBy: [{ team: { name: "asc" } }, { employeeCode: "asc" }],
  });

  return { employees, teamId, teamName: teamName || "All teams" };
}

async function getAvailableMembers(user: AppUser, args: ToolArgs) {
  const date = parseDate(args.date, "date");
  const dateValue = String(args.date);
  const scope = await resolveEmployeeScope(user, args.teamName);
  const employeeIds = scope.employees.map((employee) => employee.id);
  if (employeeIds.length === 0) return { date: dateValue, team: scope.teamName, members: [] };

  const [tasks, absences] = await Promise.all([
    prisma.task.findMany({
      where: {
        deletedAt: null,
        currentAssigneeId: { in: employeeIds },
        plannedStartDate: { lte: endOfDate(dateValue) },
        plannedEndDate: { gte: date },
        status: { notIn: ["COMPLETED", "CANCELLED"] },
      },
      select: {
        currentAssigneeId: true,
        workType: true,
        plannedStartTime: true,
        plannedEndTime: true,
        status: true,
        priority: true,
        progress: true,
        plannedEndDate: true,
      },
    }),
    prisma.nippoAbsence.findMany({
      where: { employeeId: { in: employeeIds }, absenceDate: date },
      select: { employeeId: true, period: true, absenceType: true },
    }),
  ]);

  const capacityMinutes = getAiDailyCapacityHours() * 60;
  const members = scope.employees.map((employee) => {
    const assigned = tasks.filter((task) => task.currentAssigneeId === employee.id);
    const timedRanges = assigned
      .filter((task) => task.workType === "DAILY" && task.plannedStartTime && task.plannedEndTime && timePattern.test(task.plannedStartTime) && timePattern.test(task.plannedEndTime))
      .map((task) => [minutes(task.plannedStartTime!), minutes(task.plannedEndTime!)] as [number, number]);
    const busyMinutes = Math.min(capacityMinutes, mergedMinutes(timedRanges));
    const absence = absences.find((item) => item.employeeId === employee.id);
    const absenceMinutes = absence?.period === "FULL" ? capacityMinutes : absence ? capacityMinutes / 2 : 0;
    const availableMinutes = Math.max(0, capacityMinutes - busyMinutes - absenceMinutes);
    const highPriorityTaskCount = assigned.filter((task) => task.priority === "URGENT" || task.priority === "HIGH").length;
    const overdueTaskCount = assigned.filter((task) =>
      task.workType === "PRODUCT"
      && task.status !== "WAITING"
      && task.plannedEndDate !== null && task.plannedEndDate < date,
    ).length;
    const averageProgress = assigned.length > 0
      ? Math.round(assigned.reduce((total, task) => total + task.progress, 0) / assigned.length)
      : null;

    return {
      employeeCode: employee.employeeCode,
      fullName: employee.fullName,
      team: employee.team?.name || null,
      availableHoursEstimate: Number((availableMinutes / 60).toFixed(2)),
      timedBusyHours: Number((busyMinutes / 60).toFixed(2)),
      activeTaskCount: assigned.length,
      untimedTaskCount: assigned.filter((task) => !task.plannedStartTime || !task.plannedEndTime).length,
      highPriorityTaskCount,
      overdueTaskCount,
      averageProgress,
      absence: absence ? { period: absence.period, type: absence.absenceType } : null,
    };
  }).sort((left, right) =>
    right.availableHoursEstimate - left.availableHoursEstimate
    || left.overdueTaskCount - right.overdueTaskCount
    || left.highPriorityTaskCount - right.highPriorityTaskCount
    || left.activeTaskCount - right.activeTaskCount,
  ).map((member, index) => ({ ...member, availabilityRank: index + 1 }));

  return {
    date: dateValue,
    team: scope.teamName,
    capacityHoursPerDay: getAiDailyCapacityHours(),
    calculationNote: "The rank is an estimate ordered by available timed capacity, then overdue/high-priority/active workload. Untimed PRODUCT/DAILY tasks cannot subtract exact hours and must still be considered before assignment.",
    members,
  };
}

async function getTeamWorkload(user: AppUser, args: ToolArgs) {
  const start = parseDate(args.startDate, "startDate");
  const end = parseDate(args.endDate, "endDate");
  if (end < start) throw new Error("endDate must be on or after startDate");
  const scope = await resolveEmployeeScope(user, args.teamName);
  const employeeIds = scope.employees.map((employee) => employee.id);
  const where: Prisma.TaskWhereInput = {
    deletedAt: null,
    currentAssigneeId: { in: employeeIds },
    plannedStartDate: { lte: endOfDate(String(args.endDate)) },
    plannedEndDate: { gte: start },
    status: { notIn: ["COMPLETED", "CANCELLED"] },
  };
  const tasks = employeeIds.length === 0 ? [] : await prisma.task.findMany({
    where,
    select: { currentAssigneeId: true, status: true, priority: true, workType: true },
  });

  const members = scope.employees.map((employee) => {
    const assigned = tasks.filter((task) => task.currentAssigneeId === employee.id);
    return {
      employeeCode: employee.employeeCode,
      fullName: employee.fullName,
      team: employee.team?.name || null,
      activeTaskCount: assigned.length,
      planned: assigned.filter((task) => task.status === "PLANNED").length,
      inProgress: assigned.filter((task) => task.status === "IN_PROGRESS").length,
      waiting: assigned.filter((task) => task.status === "WAITING").length,
      urgentOrHigh: assigned.filter((task) => task.priority === "URGENT" || task.priority === "HIGH").length,
      productTasks: assigned.filter((task) => task.workType === "PRODUCT").length,
      dailyTasks: assigned.filter((task) => task.workType === "DAILY").length,
    };
  }).sort((left, right) => left.activeTaskCount - right.activeTaskCount);

  return { startDate: args.startDate, endDate: args.endDate, team: scope.teamName, members };
}

async function getScheduleConflicts(user: AppUser, args: ToolArgs) {
  const date = parseDate(args.date, "date");
  const dateValue = String(args.date);
  const scope = await resolveEmployeeScope(user, args.teamName);
  const employeeIds = scope.employees.map((employee) => employee.id);
  const tasks = employeeIds.length === 0 ? [] : await prisma.task.findMany({
    where: {
      deletedAt: null,
      currentAssigneeId: { in: employeeIds },
      workType: "DAILY",
      plannedStartDate: { lte: endOfDate(dateValue) },
      plannedEndDate: { gte: date },
      plannedStartTime: { not: null },
      plannedEndTime: { not: null },
      status: { notIn: ["COMPLETED", "CANCELLED"] },
    },
    select: { taskCode: true, taskName: true, currentAssigneeId: true, plannedStartTime: true, plannedEndTime: true },
    orderBy: { plannedStartTime: "asc" },
  });

  const conflicts = scope.employees.flatMap((employee) => {
    const assigned = tasks.filter((task) => task.currentAssigneeId === employee.id && task.plannedStartTime && task.plannedEndTime);
    const pairs = [];
    for (let left = 0; left < assigned.length; left += 1) {
      for (let right = left + 1; right < assigned.length; right += 1) {
        if (assigned[left].plannedStartTime! < assigned[right].plannedEndTime! && assigned[right].plannedStartTime! < assigned[left].plannedEndTime!) {
          pairs.push({
            employeeCode: employee.employeeCode,
            fullName: employee.fullName,
            first: { code: assigned[left].taskCode, name: assigned[left].taskName, start: assigned[left].plannedStartTime, end: assigned[left].plannedEndTime },
            second: { code: assigned[right].taskCode, name: assigned[right].taskName, start: assigned[right].plannedStartTime, end: assigned[right].plannedEndTime },
          });
        }
      }
    }
    return pairs;
  });

  return { date: dateValue, team: scope.teamName, conflictCount: conflicts.length, conflicts };
}

async function getTaskActivity(user: AppUser, args: ToolArgs) {
  const start = parseDate(args.startDate, "startDate");
  const endValue = typeof args.endDate === "string" && args.endDate ? args.endDate : String(args.startDate);
  const end = parseDate(endValue, "endDate");
  if (end < start) throw new Error("endDate must be on or after startDate");

  const scope = await resolveEmployeeScope(user, args.teamName);
  const scopedEmployeeIds = scope.employees.map((employee) => employee.id);
  const where: Prisma.TaskWhereInput = {
    deletedAt: null,
    plannedStartDate: { lte: endOfDate(endValue) },
    plannedEndDate: { gte: start },
  };

  if (typeof args.product === "string" && args.product.trim()) {
    const products = await prisma.product.findMany({ select: { id: true, code: true, name: true } });
    const product = findUniqueMatch(products, args.product, (item) => [item.code, item.name]);
    if (!product) throw new Error("Product not found");
    where.productId = product.id;
  }

  if (args.workType === "PRODUCT" || args.workType === "DAILY") where.workType = args.workType;
  const allowedStatuses = ["PLANNED", "IN_PROGRESS", "WAITING", "COMPLETED", "CANCELLED"];
  const statuses = Array.isArray(args.statuses)
    ? args.statuses.filter((status): status is string => typeof status === "string" && allowedStatuses.includes(status))
    : [];
  where.status = statuses.length > 0 ? { in: statuses } : { notIn: ["COMPLETED", "CANCELLED"] };

  let selectedEmployeeId: string | undefined;
  if (typeof args.employee === "string" && args.employee.trim()) {
    const employee = findUniqueMatch(scope.employees, args.employee, (item) => [item.employeeCode, item.fullName]);
    if (!employee) throw new Error("Employee not found in the authorized scope");
    selectedEmployeeId = employee.id;
  }

  const assignment = args.assignment === "assigned" || args.assignment === "unassigned" || args.assignment === "any" ? args.assignment : "any";
  const teamRestricted = user.role === "MANAGER" || Boolean(scope.teamId);
  if (teamRestricted && assignment === "unassigned") {
    throw new Error("Unassigned tasks cannot be attributed to one team; this query is available only to an admin without a team filter");
  }
  if (selectedEmployeeId && assignment === "unassigned") throw new Error("An employee filter cannot be combined with unassigned tasks");
  if (selectedEmployeeId) {
    where.currentAssigneeId = selectedEmployeeId;
  } else if (teamRestricted) {
    where.currentAssigneeId = { in: scopedEmployeeIds };
  } else if (assignment === "assigned") {
    where.currentAssigneeId = { not: null };
  } else if (assignment === "unassigned") {
    where.currentAssigneeId = null;
  }

  const [tasks, summaryTasks] = await Promise.all([
    prisma.task.findMany({
      where,
      select: {
        id: true,
        taskCode: true,
        taskName: true,
        workType: true,
        dailyCategory: true,
        status: true,
        progress: true,
        priority: true,
        plannedStartDate: true,
        plannedEndDate: true,
        plannedStartTime: true,
        plannedEndTime: true,
        product: { select: { code: true, name: true } },
        currentAssignee: { select: { employeeCode: true, fullName: true, team: { select: { name: true } } } },
      },
      orderBy: [{ plannedStartDate: "asc" }, { taskCode: "asc" }],
      take: 100,
    }),
    prisma.task.findMany({
      where,
      select: { currentAssigneeId: true, productId: true, workType: true, status: true },
    }),
  ]);
  const totalMatched = summaryTasks.length;

  const summaryProductIds = [...new Set(summaryTasks.map((task) => task.productId).filter((id): id is string => Boolean(id)))];
  const summaryProducts = summaryProductIds.length > 0
    ? await prisma.product.findMany({ where: { id: { in: summaryProductIds } }, select: { id: true, code: true } })
    : [];
  const productCodeById = new Map(summaryProducts.map((product) => [product.id, product.code]));
  const employeeById = new Map(scope.employees.map((employee) => [employee.id, employee]));
  const byStatus = Object.fromEntries(allowedStatuses.map((status) => [status, summaryTasks.filter((task) => task.status === status).length]));
  const productCodes = summaryTasks.map((task) => task.productId ? productCodeById.get(task.productId) || "NO_PRODUCT" : (task.workType === "DAILY" ? "DAILY" : "NO_PRODUCT"));
  const byProduct = [...new Set(productCodes)]
    .map((code) => ({ code, count: productCodes.filter((taskCode) => taskCode === code).length }));
  const employeeIds = [...new Set(summaryTasks.map((task) => task.currentAssigneeId).filter((id): id is string => Boolean(id)))];
  const byEmployee = employeeIds.map((employeeId) => {
    const employee = employeeById.get(employeeId);
    return {
      employeeCode: employee?.employeeCode || "INACTIVE_OR_OUT_OF_SCOPE",
      fullName: employee?.fullName || null,
      count: summaryTasks.filter((task) => task.currentAssigneeId === employeeId).length,
    };
  });

  return {
    startDate: args.startDate,
    endDate: endValue,
    team: scope.teamName,
    filters: {
      product: typeof args.product === "string" ? args.product : null,
      employee: typeof args.employee === "string" ? args.employee : null,
      workType: args.workType || null,
      statuses: statuses.length > 0 ? statuses : "ACTIVE_DEFAULT",
      assignment,
    },
    matchedTaskCount: totalMatched,
    returnedTaskCount: tasks.length,
    truncated: totalMatched > tasks.length,
    assignedEmployeeCount: byEmployee.length,
    unassignedTaskCount: summaryTasks.filter((task) => !task.currentAssigneeId).length,
    byStatus,
    byProduct,
    byEmployee,
    tasks: tasks.map((task) => ({
      id: task.id,
      url: `/tasks/${task.id}`,
      taskCode: task.taskCode,
      taskName: task.taskName,
      product: task.product ? { code: task.product.code, name: task.product.name } : null,
      workType: task.workType,
      dailyCategory: task.dailyCategory,
      assignee: task.currentAssignee ? {
        employeeCode: task.currentAssignee.employeeCode,
        fullName: task.currentAssignee.fullName,
        team: task.currentAssignee.team?.name || null,
      } : null,
      status: task.status,
      progress: task.progress,
      priority: task.priority,
      plannedStartDate: task.plannedStartDate?.toISOString().slice(0, 10) ?? null,
      plannedEndDate: task.plannedEndDate?.toISOString().slice(0, 10) ?? null,
      plannedStartTime: task.plannedStartTime,
      plannedEndTime: task.plannedEndTime,
    })),
  };
}

async function getTaskRisks(user: AppUser, args: ToolArgs) {
  const date = parseDate(args.date, "date");
  const dateValue = String(args.date);
  const dueWithinDays = typeof args.dueWithinDays === "number" && Number.isInteger(args.dueWithinDays)
    ? Math.min(30, Math.max(0, args.dueWithinDays))
    : 7;
  const horizon = new Date(date);
  horizon.setUTCDate(horizon.getUTCDate() + dueWithinDays);
  const scope = await resolveEmployeeScope(user, args.teamName);
  const scopedEmployeeIds = scope.employees.map((employee) => employee.id);
  const where: Prisma.TaskWhereInput = {
    deletedAt: null,
    workType: "PRODUCT",
    currentAssigneeId: { in: scopedEmployeeIds },
    status: { notIn: ["COMPLETED", "CANCELLED", "WAITING"] },
    plannedEndDate: { lte: endOfDate(horizon.toISOString().slice(0, 10)) },
  };

  if (typeof args.product === "string" && args.product.trim()) {
    const products = await prisma.product.findMany({ select: { id: true, code: true, name: true } });
    const product = findUniqueMatch(products, args.product, (item) => [item.code, item.name]);
    if (!product) throw new Error("Product not found");
    where.productId = product.id;
  }

  if (typeof args.employee === "string" && args.employee.trim()) {
    const employee = findUniqueMatch(scope.employees, args.employee, (item) => [item.employeeCode, item.fullName]);
    if (!employee) throw new Error("Employee not found in the authorized scope");
    where.currentAssigneeId = employee.id;
  }

  const tasks = await prisma.task.findMany({
    where,
    select: {
      id: true,
      taskCode: true,
      taskName: true,
      status: true,
      progress: true,
      priority: true,
      plannedEndDate: true,
      product: { select: { code: true, name: true } },
      currentAssignee: { select: { employeeCode: true, fullName: true, team: { select: { name: true } } } },
    },
    orderBy: [{ plannedEndDate: "asc" }, { priority: "desc" }, { taskCode: "asc" }],
  });

  const dayMs = 86_400_000;
  const records = tasks.map((task) => {
    const endDate = task.plannedEndDate ? task.plannedEndDate.toISOString().slice(0, 10) : "";
    const difference = task.plannedEndDate ? Math.round((task.plannedEndDate.getTime() - date.getTime()) / dayMs) : 0;
    return {
      taskCode: task.taskCode,
      taskName: task.taskName,
      url: `/tasks/${task.id}`,
      product: task.product,
      assignee: task.currentAssignee,
      status: task.status,
      progress: task.progress,
      priority: task.priority,
      plannedEndDate: endDate,
      risk: difference < 0 ? "OVERDUE" : difference === 0 ? "DUE_TODAY" : "DUE_SOON",
      daysOverdue: difference < 0 ? Math.abs(difference) : 0,
      daysUntilDue: difference >= 0 ? difference : null,
    };
  });

  return {
    date: dateValue,
    dueWithinDays,
    team: scope.teamName,
    overdueCount: records.filter((task) => task.risk === "OVERDUE").length,
    dueTodayCount: records.filter((task) => task.risk === "DUE_TODAY").length,
    dueSoonCount: records.filter((task) => task.risk === "DUE_SOON").length,
    tasks: records.slice(0, 100),
    returnedTaskCount: Math.min(records.length, 100),
    matchedTaskCount: records.length,
    truncated: records.length > 100,
  };
}

export async function executeAiTool(name: string, args: ToolArgs, user: AppUser) {
  if (name === "get_available_members") return getAvailableMembers(user, args);
  if (name === "get_team_workload") return getTeamWorkload(user, args);
  if (name === "get_schedule_conflicts") return getScheduleConflicts(user, args);
  if (name === "get_task_activity") return getTaskActivity(user, args);
  if (name === "get_task_risks") return getTaskRisks(user, args);
  throw new Error("Unsupported tool");
}
