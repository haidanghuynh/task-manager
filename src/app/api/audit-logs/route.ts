import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/prisma";

function parseDate(value: string | null, endOfDay = false) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const date = new Date(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}+07:00`);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ success: false, error: { code: "UNAUTHORIZED" } }, { status: 401 });
  if (user.role !== "ADMIN") return NextResponse.json({ success: false, error: { code: "FORBIDDEN" } }, { status: 403 });

  const params = new URL(req.url).searchParams;
  const page = Math.max(1, Number.parseInt(params.get("page") || "1", 10) || 1);
  const pageSize = Math.min(100, Math.max(10, Number.parseInt(params.get("pageSize") || "25", 10) || 25));
  const search = (params.get("search") || "").trim().slice(0, 100);
  const action = (params.get("action") || "").trim();
  const entityType = (params.get("entityType") || "").trim();
  const from = parseDate(params.get("from"));
  const to = parseDate(params.get("to"), true);
  const where = {
    ...(search ? { OR: [
      { actorName: { contains: search } },
      { actorUsername: { contains: search } },
      { entityLabel: { contains: search } },
      { entityId: { contains: search } },
    ] } : {}),
    ...(action ? { action } : {}),
    ...(entityType ? { entityType } : {}),
    ...(from || to ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
  };

  const [logs, total, actionOptions, entityOptions] = await Promise.all([
    prisma.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({ distinct: ["action"], select: { action: true }, orderBy: { action: "asc" } }),
    prisma.auditLog.findMany({ distinct: ["entityType"], select: { entityType: true }, orderBy: { entityType: "asc" } }),
  ]);

  return NextResponse.json({
    success: true,
    data: {
      logs: logs.map((log) => ({
        ...log,
        details: log.details ? (() => { try { return JSON.parse(log.details); } catch { return log.details; } })() : null,
      })),
      pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
      filters: { actions: actionOptions.map((item) => item.action), entityTypes: entityOptions.map((item) => item.entityType) },
    },
  });
}
