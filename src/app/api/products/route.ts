import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ success: false, error: { code: "UNAUTHORIZED" } }, { status: 401 });
  const products = await prisma.product.findMany({ orderBy: { code: "asc" } });
  return NextResponse.json({ success: true, data: products });
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ success: false, error: { code: "UNAUTHORIZED" } }, { status: 401 });
  if (user.role !== "ADMIN") return NextResponse.json({ success: false, error: { code: "FORBIDDEN" } }, { status: 403 });

  const body = await req.json();
  const { code, name, color } = body;
  if (!code || !name) return NextResponse.json({ success: false, error: { code: "VALIDATION_ERROR", message: "code and name required" } }, { status: 400 });

  try {
    const product = await prisma.product.create({ data: { code: code.toUpperCase(), name, color: color || "#6B7280" } });
    return NextResponse.json({ success: true, data: product }, { status: 201 });
  } catch (e: any) {
    if (e.code === "P2002") return NextResponse.json({ success: false, error: { code: "DUPLICATE", message: "Product code already exists" } }, { status: 409 });
    return NextResponse.json({ success: false, error: { code: "SERVER_ERROR", message: e.message } }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ success: false, error: { code: "UNAUTHORIZED" } }, { status: 401 });
  if (user.role !== "ADMIN") return NextResponse.json({ success: false, error: { code: "FORBIDDEN" } }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ success: false, error: { code: "VALIDATION_ERROR", message: "id required" } }, { status: 400 });

  const body = await req.json();
  const { name, color, isActive } = body;
  const data: any = {};
  if (name !== undefined) data.name = name;
  if (color !== undefined) data.color = color;
  if (isActive !== undefined) data.isActive = isActive;

  const product = await prisma.product.update({ where: { id }, data });
  return NextResponse.json({ success: true, data: product });
}

export async function DELETE(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ success: false, error: { code: "UNAUTHORIZED" } }, { status: 401 });
  if (user.role !== "ADMIN") return NextResponse.json({ success: false, error: { code: "FORBIDDEN" } }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ success: false, error: { code: "VALIDATION_ERROR", message: "id required" } }, { status: 400 });

  // Check if product has tasks
  const count = await prisma.task.count({ where: { productId: id } });
  if (count > 0) {
    // Soft deactivate
    await prisma.product.update({ where: { id }, data: { isActive: false } });
    return NextResponse.json({ success: true, message: "Product deactivated (has existing tasks)" });
  }

  await prisma.product.delete({ where: { id } });
  return NextResponse.json({ success: true, message: "Product deleted" });
}
