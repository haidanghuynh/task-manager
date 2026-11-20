import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/lib/permissions";
import { recordAuditLog } from "@/lib/audit-log";
import { DEVICE_CODE_PATTERN, isDeviceCategory } from "@/lib/test-devices";
import { getBusinessDateBoundary } from "@/lib/date";

const MAX_ROWS = 1000;
const COLUMNS = [
  "code", "name", "category", "purpose", "os", "serialNumber", "location", "note",
  "employeeCode", "usageStartDate", "usageEndDate",
] as const;

const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");

function parseDate(value: string): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ success: false, error: { code: "UNAUTHORIZED" } }, { status: 401 });
  if (user.role !== "ADMIN" && !hasPermission(user, "ENVIRONMENT_MANAGE")) {
    return NextResponse.json({ success: false, error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const rows: unknown[][] = Array.isArray(body.rows) ? body.rows : [];
  if (rows.length === 0 || rows.length > MAX_ROWS + 1) {
    return NextResponse.json({ success: false, error: { code: "VALIDATION_ERROR", message: "No data to import (max 1000 rows)" } }, { status: 400 });
  }

  const dataRows = text(rows[0]?.[0]).toLowerCase() === COLUMNS[0] ? rows.slice(1) : rows;

  const [devices, employees] = await Promise.all([
    prisma.testDevice.findMany({ select: { code: true } }),
    prisma.employee.findMany({ select: { id: true, employeeCode: true } }),
  ]);
  const usedCodes = new Set(devices.map((device) => device.code.toUpperCase()));
  const employeeByCode = new Map(employees.map((employee) => [employee.employeeCode.toLowerCase(), employee.id]));

  let imported = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const [index, row] of dataRows.entries()) {
    if (!Array.isArray(row)) {
      skipped++;
      continue;
    }
    const lineNumber = index + (dataRows === rows ? 1 : 2);
    const [codeValue, nameValue, categoryValue, purposeValue, osValue, serialValue, locationValue, noteValue,
      employeeCodeValue, startValue, endValue] = row.map(text);

    const code = codeValue.toUpperCase();
    if (!DEVICE_CODE_PATTERN.test(code)) {
      errors.push(`Dòng ${lineNumber}: mã thiết bị không hợp lệ (${codeValue})`);
      skipped++;
      continue;
    }
    if (!nameValue) {
      errors.push(`Dòng ${lineNumber}: thiếu tên thiết bị`);
      skipped++;
      continue;
    }
    if (usedCodes.has(code)) {
      errors.push(`Dòng ${lineNumber}: mã "${code}" đã tồn tại, bỏ qua`);
      skipped++;
      continue;
    }

    const category = categoryValue.toUpperCase();
    if (category && !isDeviceCategory(category)) {
      errors.push(`Dòng ${lineNumber}: category không hợp lệ (${categoryValue})`);
      skipped++;
      continue;
    }

    let employeeId: string | null = null;
    if (employeeCodeValue) {
      const found = employeeByCode.get(employeeCodeValue.toLowerCase());
      if (!found) {
        errors.push(`Dòng ${lineNumber}: không tìm thấy mã nhân viên "${employeeCodeValue}"`);
        skipped++;
        continue;
      }
      employeeId = found;
    }

    const usageStartDate = parseDate(startValue);
    if (startValue && !usageStartDate) {
      errors.push(`Dòng ${lineNumber}: usageStartDate không hợp lệ (yyyy-mm-dd)`);
      skipped++;
      continue;
    }
    const usageEndDate = parseDate(endValue);
    if (endValue && !usageEndDate) {
      errors.push(`Dòng ${lineNumber}: usageEndDate không hợp lệ (yyyy-mm-dd)`);
      skipped++;
      continue;
    }
    if (usageStartDate && usageEndDate && usageEndDate < usageStartDate) {
      errors.push(`Dòng ${lineNumber}: usageEndDate trước usageStartDate`);
      skipped++;
      continue;
    }

    try {
      await prisma.$transaction(async (tx) => {
        const created = await tx.testDevice.create({
          data: {
            code,
            name: nameValue,
            category: category && isDeviceCategory(category) ? category : "LAPTOP",
            purpose: purposeValue || null,
            os: osValue || null,
            serialNumber: serialValue || null,
            location: locationValue || null,
            note: noteValue || null,
            employeeId,
            usageStartDate: employeeId ? usageStartDate ?? getBusinessDateBoundary() : null,
            usageEndDate: employeeId ? usageEndDate ?? usageStartDate ?? getBusinessDateBoundary() : null,
            status: employeeId ? "IN_USE" : "AVAILABLE",
            createdById: user.id,
          },
        });

        if (created.employeeId) {
          const start = created.usageStartDate ?? getBusinessDateBoundary();
          await tx.testDeviceUsage.create({
            data: { deviceId: created.id, employeeId: created.employeeId, startDate: start, endDate: created.usageEndDate ?? start },
          });
        }
      });
      usedCodes.add(code);
      imported++;
    } catch (error) {
      errors.push(`Dòng ${lineNumber}: ${error instanceof Error ? error.message : "lỗi không xác định"}`);
      skipped++;
    }
  }

  await recordAuditLog({
    request: req,
    actor: user,
    action: "IMPORT",
    entityType: "TEST_DEVICE_BATCH",
    entityLabel: `${imported} devices`,
    details: { imported, skipped, columns: COLUMNS },
  });

  return NextResponse.json({
    success: true,
    data: { imported, skipped, errors },
    message: `Imported ${imported} devices, skipped ${skipped}`,
  });
}
