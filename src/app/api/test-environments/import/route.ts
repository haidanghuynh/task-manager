import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/lib/permissions";
import { recordAuditLog } from "@/lib/audit-log";

const MAX_ROWS = 1000;

const COLUMNS = [
  "type", "productCode", "employeeCode", "usagePeriod", "usageEndDate", "os", "setupType",
  "virus", "hostName", "ip", "url", "deliveryDomain", "version", "buildInfo", "commonVersion", "sophosVersion",
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

  const [products, employees, existing] = await Promise.all([
    prisma.product.findMany({ select: { id: true, code: true } }),
    prisma.employee.findMany({ select: { id: true, employeeCode: true } }),
    prisma.testEnvironment.findMany({ where: { isActive: true }, select: { hostName: true } }),
  ]);

  const productByCode = new Map(products.map((product) => [product.code.toLowerCase(), product.id]));
  const employeeByCode = new Map(employees.map((employee) => [employee.employeeCode.toLowerCase(), employee.id]));
  const usedHostNames = new Set(existing.map((env) => (env.hostName || "").toLowerCase()).filter(Boolean));

  let imported = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const [index, row] of dataRows.entries()) {
    if (!Array.isArray(row)) {
      skipped++;
      continue;
    }
    const lineNumber = index + (dataRows === rows ? 1 : 2);
    const [typeValue, productCodeValue, employeeCodeValue, usagePeriodValue, usageEndDateValue, osValue, setupTypeValue,
      virusValue, hostNameValue, ipValue, urlValue, deliveryDomainValue, versionValue, buildInfoValue, commonVersionValue, sophosVersionValue] = row.map(text);

    const type = typeValue.toUpperCase();
    if (type !== "PERSONAL" && type !== "SHARED") {
      errors.push(`Dòng ${lineNumber}: type phải là PERSONAL hoặc SHARED`);
      skipped++;
      continue;
    }

    const productId = productByCode.get(productCodeValue.toLowerCase());
    if (!productId) {
      errors.push(`Dòng ${lineNumber}: không tìm thấy mã sản phẩm "${productCodeValue}"`);
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

    const usagePeriod = parseDate(usagePeriodValue);
    if (usagePeriodValue && !usagePeriod) {
      errors.push(`Dòng ${lineNumber}: usagePeriod không hợp lệ (yyyy-mm-dd)`);
      skipped++;
      continue;
    }
    const usageEndDate = parseDate(usageEndDateValue);
    if (usageEndDateValue && !usageEndDate) {
      errors.push(`Dòng ${lineNumber}: usageEndDate không hợp lệ (yyyy-mm-dd)`);
      skipped++;
      continue;
    }
    if (usagePeriod && usageEndDate && usageEndDate < usagePeriod) {
      errors.push(`Dòng ${lineNumber}: usageEndDate trước usagePeriod`);
      skipped++;
      continue;
    }

    const hostName = hostNameValue || null;
    if (hostName && usedHostNames.has(hostName.toLowerCase())) {
      errors.push(`Dòng ${lineNumber}: hostName "${hostName}" đã tồn tại, bỏ qua`);
      skipped++;
      continue;
    }

    try {
      await prisma.$transaction(async (tx) => {
        const created = await tx.testEnvironment.create({
          data: {
            type,
            productId,
            employeeId,
            usagePeriod,
            usageEndDate,
            os: osValue || null,
            setupType: setupTypeValue.toUpperCase() === "UPDATE" ? "UPDATE" : "NEW",
            virus: virusValue || null,
            hostName,
            ip: ipValue || null,
            url: urlValue || null,
            deliveryDomain: deliveryDomainValue || null,
            version: versionValue || null,
            buildInfo: buildInfoValue || null,
            commonVersion: commonVersionValue || null,
            sophosVersion: sophosVersionValue || null,
            createdById: user.id,
          },
        });

        if (created.employeeId) {
          const start = created.usagePeriod ?? new Date();
          await tx.testEnvironmentUsage.create({
            data: { environmentId: created.id, employeeId: created.employeeId, startDate: start, endDate: created.usageEndDate ?? start },
          });
        }
      });
      if (hostName) usedHostNames.add(hostName.toLowerCase());
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
    entityType: "TEST_ENVIRONMENT_BATCH",
    entityLabel: `${imported} environments`,
    details: { imported, skipped, columns: COLUMNS },
  });

  return NextResponse.json({
    success: true,
    data: { imported, skipped, errors },
    message: `Imported ${imported} environments, skipped ${skipped}`,
  });
}
