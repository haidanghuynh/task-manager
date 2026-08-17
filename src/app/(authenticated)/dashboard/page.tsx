import { getCurrentUser, getVisibleEmployeeIds } from "@/lib/auth/current-user";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { RankingChart, type RankingEntry } from "@/components/dashboard/ranking-chart";
import { DashboardPeriodFilter, DashboardPeriodSummary, type DashboardPeriodMode } from "@/components/dashboard/period-filter";
import { hasPermission } from "@/lib/permissions";
import { getBusinessDateBoundary, isOverdue } from "@/lib/date";

type DashboardSearchParams = Record<string, string | string[] | undefined>;

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] || "" : value || "";
}

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function parseDateKey(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || dateKey(date) !== value ? null : date;
}

function formatViDate(value: string) {
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

function resolveDashboardPeriod(params: DashboardSearchParams, now: Date) {
  const requestedMode = firstParam(params.period);
  const mode: DashboardPeriodMode = requestedMode === "range" || requestedMode === "year" ? requestedMode : "month";
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const defaultMonth = `${currentYear}-${String(currentMonth).padStart(2, "0")}`;

  const requestedMonth = firstParam(params.month);
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(requestedMonth) ? requestedMonth : defaultMonth;
  const [monthYear, monthNumber] = month.split("-").map(Number);

  const requestedYear = Number.parseInt(firstParam(params.year), 10);
  const year = requestedYear >= 2000 && requestedYear <= 2100 ? requestedYear : currentYear;

  const defaultFrom = `${month}-01`;
  const defaultTo = dateKey(new Date(Date.UTC(monthYear, monthNumber, 0)));
  const requestedFrom = firstParam(params.from);
  const requestedTo = firstParam(params.to);
  const parsedFrom = parseDateKey(requestedFrom);
  const parsedTo = parseDateKey(requestedTo);
  const validRange = parsedFrom && parsedTo && parsedFrom <= parsedTo;
  const from = validRange ? requestedFrom : defaultFrom;
  const to = validRange ? requestedTo : defaultTo;

  let start: Date;
  let end: Date;
  let labelVi: string;
  let labelJa: string;

  if (mode === "year") {
    start = new Date(Date.UTC(year, 0, 1));
    end = new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999));
    labelVi = `năm ${year}`;
    labelJa = `${year}年`;
  } else if (mode === "range") {
    start = new Date(`${from}T00:00:00.000Z`);
    end = new Date(`${to}T23:59:59.999Z`);
    labelVi = `từ ${formatViDate(from)} đến ${formatViDate(to)}`;
    labelJa = `${from}～${to}`;
  } else {
    start = new Date(Date.UTC(monthYear, monthNumber - 1, 1));
    end = new Date(Date.UTC(monthYear, monthNumber, 0, 23, 59, 59, 999));
    labelVi = `tháng ${monthNumber}/${monthYear}`;
    labelJa = `${monthYear}年${monthNumber}月`;
  }

  return { mode, month, year: String(year), from, to, start, end, labelVi, labelJa };
}

export default async function DashboardPage({ searchParams }: { searchParams: Promise<DashboardSearchParams> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const userRole = user.role;
  const visibleEmployeeIds = await getVisibleEmployeeIds(user);
  const canViewTasks = hasPermission(user, "TASK_VIEW");

  const now = new Date();
  const overdueBefore = getBusinessDateBoundary(now);
  const resolvedSearchParams = await searchParams;
  const period = resolveDashboardPeriod(resolvedSearchParams, now);
  const includeDailyInRanking = firstParam(resolvedSearchParams.includeDaily) === "true";

  // Build filter for non-manager/non-admin users
  const taskFilterBase: any = {
    deletedAt: null,
    plannedStartDate: { lte: period.end },
    plannedEndDate: { gte: period.start },
  };

  if (!canViewTasks) {
    taskFilterBase.currentAssigneeId = { in: [] };
  } else if (userRole === "EMPLOYEE") {
    taskFilterBase.currentAssigneeId = { in: visibleEmployeeIds ?? [] };
  }

  // Dashboard stats
  const [totalTasks, productTasks, dailyWorkTasks, plannedTasks, inProgressTasks, completedTasks, overdueTasks] =
    await Promise.all([
      prisma.task.count({ where: taskFilterBase }),
      prisma.task.count({ where: { ...taskFilterBase, workType: "PRODUCT" } }),
      prisma.task.count({ where: { ...taskFilterBase, workType: "DAILY" } }),
      prisma.task.count({ where: { ...taskFilterBase, status: "PLANNED" } }),
      prisma.task.count({ where: { ...taskFilterBase, status: "IN_PROGRESS" } }),
      prisma.task.count({ where: { ...taskFilterBase, status: "COMPLETED" } }),
      prisma.task.count({
        where: {
          ...taskFilterBase,
          status: { notIn: ["COMPLETED", "CANCELLED"] },
          plannedEndDate: { gte: period.start, lt: overdueBefore },
        },
      }),
    ]);

  // Employees without tasks (for managers)
  let employeesWithoutTasks = 0;
  if (userRole === "ADMIN" || userRole === "MANAGER") {
    const activeEmployees = await prisma.employee.findMany({
      where: { isActive: true },
      select: { id: true },
    });

    const employeesWithTasks = await prisma.task.findMany({
      where: {
        deletedAt: null,
        status: { notIn: ["COMPLETED", "CANCELLED"] },
        currentAssigneeId: { not: null },
      },
      select: { currentAssigneeId: true },
      distinct: ["currentAssigneeId"],
    });

    const assignedIds = new Set(employeesWithTasks.map((t) => t.currentAssigneeId));
    employeesWithoutTasks = activeEmployees.filter((e) => !assignedIds.has(e.id)).length;
  }

  // Tasks by product
  const tasksByProduct = await prisma.product.findMany({
    where: { isActive: true },
    include: { _count: { select: { tasks: { where: { ...taskFilterBase } } } } },
  });

  // Tasks by status
  const statuses = ["PLANNED", "IN_PROGRESS", "WAITING", "COMPLETED", "CANCELLED"];
  const tasksByStatus = await Promise.all(
    statuses.map((status) =>
      prisma.task.count({ where: { ...taskFilterBase, status } })
    )
  );

  let memberRanking: RankingEntry[] = [];
  let teamRanking: RankingEntry[] = [];
  if (canViewTasks) {
    const employees = await prisma.employee.findMany({
      where: {
        isActive: true,
        ...(userRole === "EMPLOYEE" ? { id: { in: visibleEmployeeIds ?? [] } } : {}),
      },
      select: {
        id: true, employeeCode: true, fullName: true,
        team: { select: { id: true, name: true } },
          tasks: {
            where: {
              deletedAt: null,
              plannedStartDate: { lte: period.end },
              plannedEndDate: { gte: period.start },
              ...(includeDailyInRanking ? {} : { workType: "PRODUCT" }),
            },
          select: { status: true, plannedEndDate: true },
        },
      },
    });

    const metrics = (tasks: Array<{ status: string; plannedEndDate: Date }>) => {
      const total = tasks.length;
      const completed = tasks.filter((task) => task.status === "COMPLETED").length;
      return {
        total,
        completed,
        planned: tasks.filter((task) => task.status === "PLANNED").length,
        inProgress: tasks.filter((task) => task.status === "IN_PROGRESS").length,
        waiting: tasks.filter((task) => task.status === "WAITING").length,
        cancelled: tasks.filter((task) => task.status === "CANCELLED").length,
        overdue: tasks.filter((task) => isOverdue(task.plannedEndDate, task.status, null, now)).length,
        completionRate: total > 0 ? Math.round((completed / total) * 100) : 0,
      };
    };
    const sortRanking = (a: RankingEntry, b: RankingEntry) =>
      b.completed - a.completed || b.completionRate - a.completionRate || b.total - a.total || a.name.localeCompare(b.name);

    memberRanking = employees.map((employee) => ({
      id: employee.id,
      name: employee.fullName,
      subtitle: `${employee.employeeCode} · ${employee.team?.name || "Chưa có nhóm"}`,
      ...metrics(employee.tasks),
    })).sort(sortRanking);

    const groupedTeams = new Map<string, { id: string; name: string; memberCount: number; tasks: Array<{ status: string; plannedEndDate: Date }> }>();
    for (const employee of employees) {
      const team = employee.team || { id: "unassigned", name: "Chưa có nhóm" };
      const existing = groupedTeams.get(team.id) || { ...team, memberCount: 0, tasks: [] };
      existing.memberCount++;
      existing.tasks.push(...employee.tasks);
      groupedTeams.set(team.id, existing);
    }
    teamRanking = [...groupedTeams.values()].map((team) => ({
      id: team.id,
      name: team.name,
      subtitle: `${team.memberCount} thành viên`,
      memberCount: team.memberCount,
      ...metrics(team.tasks),
    })).sort(sortRanking);
  }

  const statusLabels: Record<string, string> = {
    PLANNED: "Chưa bắt đầu",
    IN_PROGRESS: "Đang thực hiện",
    WAITING: "Đang chờ",
    COMPLETED: "Hoàn thành",
    CANCELLED: "Đã hủy",
  };

  const stats = [
    { label: "Tổng task trong kỳ", value: totalTasks, color: "bg-blue-500" },
    { label: "Task sản phẩm", value: productTasks, color: "bg-cyan-500" },
    { label: "Công việc hằng ngày", value: dailyWorkTasks, color: "bg-purple-500" },
    { label: "Chưa bắt đầu", value: plannedTasks, color: "bg-gray-500" },
    { label: "Đang thực hiện", value: inProgressTasks, color: "bg-yellow-500" },
    { label: "Hoàn thành", value: completedTasks, color: "bg-green-500" },
    { label: "Quá hạn", value: overdueTasks, color: "bg-red-500" },
  ];

  if (userRole !== "EMPLOYEE") {
    stats.push({
      label: "Nhân viên chưa có task",
      value: employeesWithoutTasks,
      color: "bg-orange-500",
    });
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Tổng quan</h2>
        <DashboardPeriodSummary label={{ vi: period.labelVi, ja: period.labelJa }} />
      </div>

      <DashboardPeriodFilter mode={period.mode} month={period.month} year={period.year} from={period.from} to={period.to} includeDaily={includeDailyInRanking} />

      {/* Stats cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="bg-white rounded-xl shadow-sm border border-gray-200 p-5"
          >
            <div className="flex items-center gap-3">
              <div className={`w-3 h-3 rounded-full ${stat.color}`} />
              <p className="text-sm text-gray-500">{stat.label}</p>
            </div>
            <p className="text-3xl font-bold text-gray-900 mt-2">{stat.value}</p>
          </div>
        ))}
      </div>

      {canViewTasks && (
        <RankingChart
          members={memberRanking}
          teams={teamRanking}
          periodLabel={{ vi: period.labelVi, ja: period.labelJa }}
          range={{ from: dateKey(period.start), to: dateKey(period.end) }}
          includeDaily={includeDailyInRanking}
        />
      )}

      {/* Tasks by Product */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Task theo sản phẩm</h3>
        <div className="space-y-3">
          {tasksByProduct.map((product) => (
            <div key={product.id} className="flex items-center gap-3">
              <div
                className="w-4 h-4 rounded"
                style={{ backgroundColor: product.color }}
              />
              <span className="text-sm text-gray-700 flex-1">{product.name}</span>
              <span className="text-sm font-semibold text-gray-900">
                {product._count.tasks}
              </span>
              <div className="w-48 h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${productTasks > 0 ? (product._count.tasks / productTasks) * 100 : 0}%`,
                    backgroundColor: product.color,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Tasks by Status */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Task theo trạng thái</h3>
        <div className="space-y-3">
          {statuses.map((status, i) => (
            <div key={status} className="flex items-center gap-3">
              <span className="text-sm text-gray-700 w-32">
                {statusLabels[status]}
              </span>
              <span className="text-sm font-semibold text-gray-900 w-8">
                {tasksByStatus[i]}
              </span>
              <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full bg-blue-500"
                  style={{
                    width: `${totalTasks > 0 ? (tasksByStatus[i] / totalTasks) * 100 : 0}%`,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
