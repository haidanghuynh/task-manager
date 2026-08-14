import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/prisma";

const codePattern = /^[A-Z0-9][A-Z0-9_-]{0,49}$/;
const colorPattern = /^#[0-9A-F]{6}$/i;

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ success: false, error: { code: "UNAUTHORIZED" } }, { status: 401 });
  const activeOnly = new URL(req.url).searchParams.get("active") === "true";
  const categories = await prisma.dailyWorkCategory.findMany({ where: activeOnly ? { isActive: true } : undefined, orderBy: [{ isActive: "desc" }, { code: "asc" }] });
  return NextResponse.json({ success: true, data: categories });
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ success: false, error: { code: "UNAUTHORIZED" } }, { status: 401 });
  if (user.role !== "ADMIN") return NextResponse.json({ success: false, error: { code: "FORBIDDEN" } }, { status: 403 });
  const body = await req.json();
  const code = String(body.code || "").trim().toUpperCase();
  const nameVi = String(body.nameVi || "").trim();
  const nameJa = String(body.nameJa || "").trim();
  const color = String(body.color || "#8B5CF6").trim();
  if (!codePattern.test(code) || !nameVi || !nameJa || !colorPattern.test(color)) return NextResponse.json({ success: false, error: { code: "VALIDATION_ERROR" } }, { status: 400 });
  try {
    const category = await prisma.dailyWorkCategory.create({ data: { code, nameVi, nameJa, color } });
    return NextResponse.json({ success: true, data: category }, { status: 201 });
  } catch {
    return NextResponse.json({ success: false, error: { code: "DUPLICATE" } }, { status: 409 });
  }
}

export async function PATCH(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ success: false, error: { code: "UNAUTHORIZED" } }, { status: 401 });
  if (user.role !== "ADMIN") return NextResponse.json({ success: false, error: { code: "FORBIDDEN" } }, { status: 403 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ success: false, error: { code: "VALIDATION_ERROR" } }, { status: 400 });
  const body = await req.json();
  const data: { nameVi?: string; nameJa?: string; color?: string; isActive?: boolean } = {};
  if (body.nameVi !== undefined) data.nameVi = String(body.nameVi).trim();
  if (body.nameJa !== undefined) data.nameJa = String(body.nameJa).trim();
  if (body.color !== undefined) data.color = String(body.color).trim();
  if (body.isActive !== undefined) data.isActive = Boolean(body.isActive);
  if ((data.nameVi !== undefined && !data.nameVi) || (data.nameJa !== undefined && !data.nameJa) || (data.color !== undefined && !colorPattern.test(data.color))) return NextResponse.json({ success: false, error: { code: "VALIDATION_ERROR" } }, { status: 400 });
  const category = await prisma.dailyWorkCategory.update({ where: { id }, data });
  return NextResponse.json({ success: true, data: category });
}

export async function DELETE(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ success: false, error: { code: "UNAUTHORIZED" } }, { status: 401 });
  if (user.role !== "ADMIN") return NextResponse.json({ success: false, error: { code: "FORBIDDEN" } }, { status: 403 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ success: false, error: { code: "VALIDATION_ERROR" } }, { status: 400 });
  const category = await prisma.dailyWorkCategory.findUnique({ where: { id }, select: { code: true } });
  if (!category) return NextResponse.json({ success: false, error: { code: "NOT_FOUND" } }, { status: 404 });
  const taskCount = await prisma.task.count({ where: { workType: "DAILY", dailyCategory: category.code } });
  if (taskCount > 0) await prisma.dailyWorkCategory.update({ where: { id }, data: { isActive: false } });
  else await prisma.dailyWorkCategory.delete({ where: { id } });
  return NextResponse.json({ success: true, data: { deactivated: taskCount > 0 } });
}
