import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/lib/permissions";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ success: false, error: { code: "UNAUTHORIZED" } }, { status: 401 });
  const teams = await prisma.team.findMany({
    where: user.role === "EMPLOYEE" ? { id: user.teamId ?? "__no_team__" } : undefined,
    include: { lead: { select: { id: true, fullName: true, employeeCode: true } }, _count: { select: { members: true, employees: true } } },
    orderBy: { name: "asc" },
  });
  return NextResponse.json({ success: true, data: teams });
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ success: false, error: { code: "UNAUTHORIZED" } }, { status: 401 });
  if (!hasPermission(user, "TEAM_MANAGE")) return NextResponse.json({ success: false, error: { code: "FORBIDDEN" } }, { status: 403 });
  const body = await req.json();
  const { name, description, icon, leadId } = body;
  if (!name) return NextResponse.json({ success: false, error: { code: "VALIDATION_ERROR" } }, { status: 400 });
  const team = await prisma.team.create({ data: { name, description: description || null, icon: icon || "🐉", leadId: leadId || null }, include: { lead: true } });
  return NextResponse.json({ success: true, data: team }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ success: false, error: { code: "UNAUTHORIZED" } }, { status: 401 });
  if (!hasPermission(user, "TEAM_MANAGE")) return NextResponse.json({ success: false, error: { code: "FORBIDDEN" } }, { status: 403 });
  const body = await req.json();
  const { id, name, description, icon, leadId } = body;
  if (!id) return NextResponse.json({ success: false, error: { code: "VALIDATION_ERROR" } }, { status: 400 });

  // If leadId is being set, clear it from any other team first
  if (leadId !== undefined && leadId) {
    await prisma.team.updateMany({ where: { leadId, id: { not: id } }, data: { leadId: null } });
  }

  const data: any = {};
  if (name !== undefined) data.name = name;
  if (description !== undefined) data.description = description;
  if (icon !== undefined) data.icon = icon;
  if (leadId !== undefined) data.leadId = leadId || null;
  const team = await prisma.team.update({ where: { id }, data, include: { lead: true } });
  return NextResponse.json({ success: true, data: team });
}

export async function DELETE(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ success: false, error: { code: "UNAUTHORIZED" } }, { status: 401 });
  if (!hasPermission(user, "TEAM_MANAGE")) return NextResponse.json({ success: false, error: { code: "FORBIDDEN" } }, { status: 403 });
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ success: false, error: { code: "VALIDATION_ERROR" } }, { status: 400 });
  await prisma.team.delete({ where: { id } });
  return NextResponse.json({ success: true, message: "Team deleted" });
}
