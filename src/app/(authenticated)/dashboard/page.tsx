import { getCurrentUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { RankingChart, type RankingEntry } from "@/components/dashboard/ranking-chart";

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const userRole = user.role;
  const userEmployeeId = user.employeeId;

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

  // Build filter for non-manager/non-admin users
  const taskFilterBase: any = {
    deletedAt: null,
    plannedStartDate: { lte: endOfMonth },
    plannedEndDate: { gte: startOfMonth },
  };

  if (userRole === "EMPLOYEE") {
    taskFilterBase.currentAssigneeId = userEmployeeId;
  }

  // Dashboard stats
  const [totalTasks, plannedTasks, inProgressTasks, completedTasks, overdueTasks] =
    await Promise.all([
      prisma.task.count({ where: taskFilterBase }),
      prisma.task.count({ where: { ...taskFilterBase, status: "PLANNED" } }),
      prisma.task.count({ where: { ...taskFilterBase, status: "IN_PROGRESS" } }),
      prisma.task.count({ where: { ...taskFilterBase, status: "COMPLETED" } }),
      prisma.task.count({
        where: {
          ...taskFilterBase,
          status: { notIn: ["COMPLETED", "CANCELLED"] },
          plannedEndDate: { lt: now },
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
  if (userRole === "ADMIN" || userRole === "MANAGER") {
    const employees = await prisma.employee.findMany({
      where: { isActive: true },
      select: {
        id: true, employeeCode: true, fullName: true,
        team: { select: { id: true, name: true } },
        tasks: {
          where: {
            deletedAt: null,
            status: { not: "CANCELLED" },
            plannedStartDate: { lte: endOfMonth },
            plannedEndDate: { gte: startOfMonth },
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
        inProgress: tasks.filter((task) => task.status === "IN_PROGRESS").length,
        overdue: tasks.filter((task) => task.status !== "COMPLETED" && task.plannedEndDate < now).length,
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
    { label: "Tổng task trong tháng", value: totalTasks, color: "bg-blue-500" },
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
        <p className="text-sm text-gray-500 mt-1">
          Tháng {now.getMonth() + 1}/{now.getFullYear()}
        </p>
      </div>

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

      {(userRole === "ADMIN" || userRole === "MANAGER") && (
        <RankingChart members={memberRanking} teams={teamRanking} />
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
                    width: `${totalTasks > 0 ? (product._count.tasks / totalTasks) * 100 : 0}%`,
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
