import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { hasPermission } from "@/lib/permissions";
import { parseReportDate } from "@/lib/nippo";
import { prisma } from "@/lib/prisma";
import { saveNippoSchema } from "@/lib/validation/nippo";

const taskInclude = {
  product: { select: { id: true, name: true, code: true, color: true } },
} as const;

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ success: false, error: { code: "UNAUTHORIZED" } }, { status: 401 });
  if (!hasPermission(user, "NIPPO_VIEW")) return NextResponse.json({ success: false, error: { code: "FORBIDDEN" } }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const mode = searchParams.get("mode") || "mine";
  const dateValue = searchParams.get("date") || new Date().toISOString().slice(0, 10);
  const range = parseReportDate(dateValue);
  if (!range) return NextResponse.json({ success: false, error: { code: "VALIDATION_ERROR", message: "Invalid date" } }, { status: 400 });

  if (mode === "overview") {
    if (user.role !== "ADMIN") return NextResponse.json({ success: false, error: { code: "FORBIDDEN" } }, { status: 403 });
    const teams = await prisma.team.findMany({
      select: {
        id: true,
        name: true,
        icon: true,
        employees: {
          where: { isActive: true },
          select: { id: true },
        },
      },
      orderBy: { name: "asc" },
    });
    const employeeIds = teams.flatMap((team) => team.employees.map((employee) => employee.id));
    const [reports, absences] = employeeIds.length > 0 ? await Promise.all([
      prisma.nippoReport.findMany({
        where: { employeeId: { in: employeeIds }, reportDate: range.start },
        select: { employeeId: true, status: true, items: { select: { hours: true } } },
      }),
      prisma.nippoAbsence.findMany({
        where: { employeeId: { in: employeeIds }, absenceDate: range.start },
        select: { employeeId: true },
      }),
    ]) : [[], []];
    const reportByEmployee = new Map(reports.map((report) => [report.employeeId, report]));
    const absentEmployeeIds = new Set(absences.map((absence) => absence.employeeId));
    const summary = teams.map((team) => {
      const members = team.employees.length;
      const teamReports = team.employees.flatMap((employee) => {
        const report = reportByEmployee.get(employee.id);
        return report ? [report] : [];
      });
      const submitted = teamReports.filter((report) => report.status === "SUBMITTED").length;
      const draft = teamReports.filter((report) => report.status !== "SUBMITTED").length;
      const absent = team.employees.filter((employee) => absentEmployeeIds.has(employee.id)).length;
      const missing = team.employees.filter((employee) => !reportByEmployee.has(employee.id) && !absentEmployeeIds.has(employee.id)).length;
      const totalHours = teamReports.reduce((sum, report) => sum + report.items.reduce((itemSum, item) => itemSum + item.hours, 0), 0);
      return { id: team.id, name: team.name, icon: team.icon, members, submitted, draft, absent, missing, totalHours };
    });
    return NextResponse.json({
      success: true,
      data: {
        reportDate: dateValue,
        teams: summary,
        totals: summary.reduce((totals, team) => ({
          members: totals.members + team.members,
          submitted: totals.submitted + team.submitted,
          draft: totals.draft + team.draft,
          absent: totals.absent + team.absent,
          missing: totals.missing + team.missing,
          totalHours: totals.totalHours + team.totalHours,
        }), { members: 0, submitted: 0, draft: 0, absent: 0, missing: 0, totalHours: 0 }),
      },
    });
  }

  if (mode === "team") {
    if (!hasPermission(user, "NIPPO_MANAGE")) return NextResponse.json({ success: false, error: { code: "FORBIDDEN" } }, { status: 403 });
    const teamId = searchParams.get("teamId") || user.teamId || "";
    if (!teamId || (user.role === "EMPLOYEE" && teamId !== user.teamId)) {
      return NextResponse.json({ success: false, error: { code: "FORBIDDEN" } }, { status: 403 });
    }
    const team = await prisma.team.findUnique({
      where: { id: teamId },
      select: {
        id: true, name: true, icon: true,
        employees: { where: { isActive: true }, select: { id: true, employeeCode: true, fullName: true }, orderBy: { employeeCode: "asc" } },
      },
    });
    if (!team) return NextResponse.json({ success: false, error: { code: "NOT_FOUND" } }, { status: 404 });
    const employeeIds = team.employees.map((employee) => employee.id);
    const [reports, absences] = await Promise.all([
      prisma.nippoReport.findMany({
        where: { employeeId: { in: employeeIds }, reportDate: range.start },
        include: { items: { include: { task: { include: taskInclude } }, orderBy: { sortOrder: "asc" } } },
      }),
      prisma.nippoAbsence.findMany({
        where: { employeeId: { in: employeeIds }, absenceDate: range.start },
        include: { recordedBy: { select: { id: true, name: true } } },
      }),
    ]);
    const reportByEmployee = new Map(reports.map((report) => [report.employeeId, report]));
    const absenceByEmployee = new Map(absences.map((absence) => [absence.employeeId, absence]));
    return NextResponse.json({
      success: true,
      data: {
        team: { id: team.id, name: team.name, icon: team.icon },
        reportDate: dateValue,
        members: team.employees.map((employee) => ({
          ...employee,
          report: reportByEmployee.get(employee.id) || null,
          absence: absenceByEmployee.get(employee.id) || null,
        })),
      },
    });
  }

  if (!user.employeeId) {
    return NextResponse.json({ success: false, error: { code: "EMPLOYEE_REQUIRED", message: "Account is not linked to an employee" } }, { status: 400 });
  }
  const [employee, report, absence, tasks] = await Promise.all([
    prisma.employee.findUnique({ where: { id: user.employeeId }, select: { id: true, employeeCode: true, fullName: true, teamId: true, team: { select: { id: true, name: true } } } }),
    prisma.nippoReport.findUnique({
      where: { employeeId_reportDate: { employeeId: user.employeeId, reportDate: range.start } },
      include: { items: { include: { task: { include: taskInclude } }, orderBy: { sortOrder: "asc" } } },
    }),
    prisma.nippoAbsence.findUnique({ where: { employeeId_absenceDate: { employeeId: user.employeeId, absenceDate: range.start } } }),
    prisma.task.findMany({
      where: {
        deletedAt: null,
        status: { not: "CANCELLED" },
        plannedStartDate: { lte: range.end },
        plannedEndDate: { gte: range.start },
        OR: [
          { currentAssigneeId: user.employeeId },
          { assignmentHistory: { some: { employeeId: user.employeeId, assignedFrom: { lte: range.end }, OR: [{ assignedUntil: null }, { assignedUntil: { gte: range.start } }] } } },
        ],
      },
      include: taskInclude,
      orderBy: [{ priority: "desc" }, { taskCode: "asc" }],
    }),
  ]);
  if (!employee) return NextResponse.json({ success: false, error: { code: "EMPLOYEE_REQUIRED" } }, { status: 400 });

  const taskIds = tasks.map((task) => task.id);
  const previousItems = taskIds.length > 0 ? await prisma.nippoItem.findMany({
    where: { taskId: { in: taskIds }, report: { employeeId: user.employeeId, reportDate: { lt: range.start } }, progressAfter: { not: null } },
    include: { report: { select: { reportDate: true } } },
    orderBy: { report: { reportDate: "desc" } },
  }) : [];
  const previousByTask = new Map<string, number>();
  for (const item of previousItems) {
    if (item.taskId && item.progressAfter != null && !previousByTask.has(item.taskId)) previousByTask.set(item.taskId, item.progressAfter);
  }

  return NextResponse.json({
    success: true,
    data: {
      reportDate: dateValue,
      employee,
      report,
      absence,
      candidateTasks: tasks.map((task) => ({ ...task, previousProgress: previousByTask.get(task.id) ?? task.progress })),
    },
  });
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ success: false, error: { code: "UNAUTHORIZED" } }, { status: 401 });
  if (!hasPermission(user, "NIPPO_SUBMIT")) return NextResponse.json({ success: false, error: { code: "FORBIDDEN" } }, { status: 403 });
  if (!user.employeeId) return NextResponse.json({ success: false, error: { code: "EMPLOYEE_REQUIRED" } }, { status: 400 });

  const parsed = saveNippoSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ success: false, error: { code: "VALIDATION_ERROR", details: parsed.error.flatten() } }, { status: 400 });
  const range = parseReportDate(parsed.data.reportDate)!;
  const employee = await prisma.employee.findUnique({ where: { id: user.employeeId }, select: { teamId: true, isActive: true } });
  if (!employee?.isActive) return NextResponse.json({ success: false, error: { code: "EMPLOYEE_REQUIRED" } }, { status: 400 });

  const taskIds = [...new Set(parsed.data.items.flatMap((item) => item.taskId ? [item.taskId] : []))];
  if (taskIds.length > 0) {
    const allowedTasks = await prisma.task.count({
      where: {
        id: { in: taskIds }, deletedAt: null,
        OR: [
          { currentAssigneeId: user.employeeId },
          { assignmentHistory: { some: { employeeId: user.employeeId, assignedFrom: { lte: range.end }, OR: [{ assignedUntil: null }, { assignedUntil: { gte: range.start } }] } } },
        ],
      },
    });
    if (allowedTasks !== taskIds.length) return NextResponse.json({ success: false, error: { code: "INVALID_TASK" } }, { status: 400 });
  }

  const report = await prisma.$transaction(async (tx) => {
    const saved = await tx.nippoReport.upsert({
      where: { employeeId_reportDate: { employeeId: user.employeeId!, reportDate: range.start } },
      create: {
        reportDate: range.start, employeeId: user.employeeId!, teamId: employee.teamId,
        status: parsed.data.status, summary: parsed.data.summary || null, blockers: null,
        nextPlan: null, submittedAt: parsed.data.status === "SUBMITTED" ? new Date() : null,
      },
      update: {
        teamId: employee.teamId, status: parsed.data.status, summary: parsed.data.summary || null,
        blockers: null, nextPlan: null,
        submittedAt: parsed.data.status === "SUBMITTED" ? new Date() : null,
      },
    });
    await tx.nippoItem.deleteMany({ where: { reportId: saved.id } });
    if (parsed.data.items.length > 0) {
      await tx.nippoItem.createMany({ data: parsed.data.items.map((item, index) => ({
        reportId: saved.id, taskId: item.taskId || null, title: item.title,
        workContent: item.workContent || null, result: item.result || null, hours: item.hours,
        progressBefore: item.progressBefore ?? null, progressAfter: item.progressAfter ?? null, sortOrder: index,
      })) });
    }
    return tx.nippoReport.findUnique({ where: { id: saved.id }, include: { items: { orderBy: { sortOrder: "asc" } } } });
  });
  return NextResponse.json({ success: true, data: report });
}

export async function DELETE(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ success: false, error: { code: "UNAUTHORIZED" } }, { status: 401 });
  if (!hasPermission(user, "NIPPO_SUBMIT")) return NextResponse.json({ success: false, error: { code: "FORBIDDEN" } }, { status: 403 });
  if (!user.employeeId) return NextResponse.json({ success: false, error: { code: "EMPLOYEE_REQUIRED" } }, { status: 400 });
  const dateValue = new URL(req.url).searchParams.get("date") || "";
  const range = parseReportDate(dateValue);
  if (!range) return NextResponse.json({ success: false, error: { code: "VALIDATION_ERROR" } }, { status: 400 });
  const report = await prisma.nippoReport.findUnique({ where: { employeeId_reportDate: { employeeId: user.employeeId, reportDate: range.start } } });
  if (!report) return NextResponse.json({ success: false, error: { code: "NOT_FOUND" } }, { status: 404 });
  await prisma.nippoReport.delete({ where: { id: report.id } });
  return NextResponse.json({ success: true });
}
