import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ success: false, error: { code: "UNAUTHORIZED" } }, { status: 401 });
  if (user.role !== "ADMIN" && user.role !== "MANAGER") {
    return NextResponse.json({ success: false, error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const body = await req.json();
  const { teamId, employeeId } = body;
  if (!teamId || !employeeId) return NextResponse.json({ success: false, error: { code: "VALIDATION_ERROR" } }, { status: 400 });

  try {
    const member = await prisma.$transaction(async (tx) => {
      await tx.teamMember.deleteMany({ where: { employeeId } });
      const created = await tx.teamMember.create({ data: { teamId, employeeId }, include: { employee: true } });
      await tx.employee.update({ where: { id: employeeId }, data: { teamId } });
      return created;
    });
    return NextResponse.json({ success: true, data: member }, { status: 201 });
  } catch (e: any) {
    if (e.code === "P2002") return NextResponse.json({ success: false, error: { code: "DUPLICATE", message: "Member already exists" } }, { status: 409 });
    return NextResponse.json({ success: false, error: { code: "SERVER_ERROR", message: e.message } }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ success: false, error: { code: "UNAUTHORIZED" } }, { status: 401 });
  if (user.role !== "ADMIN" && user.role !== "MANAGER") {
    return NextResponse.json({ success: false, error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const teamId = searchParams.get("teamId");
  const employeeId = searchParams.get("employeeId");
  if (!teamId || !employeeId) return NextResponse.json({ success: false, error: { code: "VALIDATION_ERROR" } }, { status: 400 });

  await prisma.teamMember.deleteMany({ where: { teamId, employeeId } });
  await prisma.employee.updateMany({ where: { id: employeeId, teamId }, data: { teamId: null } });
  return NextResponse.json({ success: true, message: "Member removed" });
}
