import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { parseReportDate } from "@/lib/nippo";
import { hasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { saveAbsenceSchema } from "@/lib/validation/nippo";

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ success: false, error: { code: "UNAUTHORIZED" } }, { status: 401 });
  if (!hasPermission(user, "NIPPO_MANAGE")) return NextResponse.json({ success: false, error: { code: "FORBIDDEN" } }, { status: 403 });
  const parsed = saveAbsenceSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ success: false, error: { code: "VALIDATION_ERROR", details: parsed.error.flatten() } }, { status: 400 });
  if (user.role === "EMPLOYEE" && parsed.data.teamId !== user.teamId) return NextResponse.json({ success: false, error: { code: "FORBIDDEN" } }, { status: 403 });
  const employee = await prisma.employee.findFirst({ where: { id: parsed.data.employeeId, teamId: parsed.data.teamId, isActive: true } });
  if (!employee) return NextResponse.json({ success: false, error: { code: "INVALID_EMPLOYEE" } }, { status: 400 });
  const date = parseReportDate(parsed.data.absenceDate)!.start;
  const absence = await prisma.nippoAbsence.upsert({
    where: { employeeId_absenceDate: { employeeId: parsed.data.employeeId, absenceDate: date } },
    create: { ...parsed.data, absenceDate: date, reason: parsed.data.reason || null, recordedById: user.id },
    update: { teamId: parsed.data.teamId, absenceType: parsed.data.absenceType, period: parsed.data.period, reason: parsed.data.reason || null, recordedById: user.id },
  });
  return NextResponse.json({ success: true, data: absence });
}

export async function DELETE(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ success: false, error: { code: "UNAUTHORIZED" } }, { status: 401 });
  if (!hasPermission(user, "NIPPO_MANAGE")) return NextResponse.json({ success: false, error: { code: "FORBIDDEN" } }, { status: 403 });
  const { searchParams } = new URL(req.url);
  const employeeId = searchParams.get("employeeId") || "";
  const dateValue = searchParams.get("date") || "";
  const range = parseReportDate(dateValue);
  if (!employeeId || !range) return NextResponse.json({ success: false, error: { code: "VALIDATION_ERROR" } }, { status: 400 });
  const absence = await prisma.nippoAbsence.findUnique({ where: { employeeId_absenceDate: { employeeId, absenceDate: range.start } } });
  if (!absence || (user.role === "EMPLOYEE" && absence.teamId !== user.teamId)) return NextResponse.json({ success: false, error: { code: "NOT_FOUND" } }, { status: 404 });
  await prisma.nippoAbsence.delete({ where: { id: absence.id } });
  return NextResponse.json({ success: true });
}
