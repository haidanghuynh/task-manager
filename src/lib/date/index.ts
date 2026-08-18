import {
  format,
  parseISO,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isWeekend,
  isSameDay,
  isBefore,
  isAfter,
  differenceInDays,
  addDays,
} from "date-fns";

export const BUSINESS_TIME_ZONE = "Asia/Ho_Chi_Minh";

const businessDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: BUSINESS_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * Returns the business calendar date as UTC midnight. Planned task dates are
 * stored as UTC-midnight values, so this avoids marking a task overdue during
 * its due date.
 */
export function getBusinessDateBoundary(date = new Date()): Date {
  const parts = businessDateFormatter.formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return new Date(`${value.year}-${value.month}-${value.day}T00:00:00.000Z`);
}

function getStoredDateBoundary(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export function formatDate(date: Date | string, fmt = "dd/MM/yyyy"): string {
  const d = typeof date === "string" ? parseISO(date) : date;
  return format(d, fmt);
}

export function getMonthDays(year: number, month: number): Date[] {
  const start = startOfMonth(new Date(year, month));
  const end = endOfMonth(new Date(year, month));
  return eachDayOfInterval({ start, end });
}

export function isWeekendDay(date: Date): boolean {
  return isWeekend(date);
}

export function isSameDate(a: Date, b: Date): boolean {
  return isSameDay(a, b);
}

export function isDateBefore(a: Date, b: Date): boolean {
  return isBefore(a, b);
}

export function isDateAfter(a: Date, b: Date): boolean {
  return isAfter(a, b);
}

export function diffDays(a: Date, b: Date): number {
  return differenceInDays(b, a) + 1;
}

export function addDay(date: Date, days: number): Date {
  return addDays(date, days);
}

export function isOverdue(
  plannedEnd: Date,
  status: string,
  actualEnd?: Date | null,
  now = new Date(),
  workType?: string,
): boolean {
  const plannedEndDate = getStoredDateBoundary(plannedEnd);
  if (actualEnd) return getBusinessDateBoundary(actualEnd) > plannedEndDate;
  if (status === "COMPLETED" || status === "CANCELLED" || status === "WAITING") return false;
  if (workType === "DAILY") return false;
  return plannedEndDate < getBusinessDateBoundary(now);
}

export function isOnTime(actualEnd: Date, plannedEnd: Date): boolean {
  return isBefore(actualEnd, plannedEnd) || isSameDay(actualEnd, plannedEnd);
}

export function isLate(actualEnd: Date, plannedEnd: Date): boolean {
  return isAfter(actualEnd, plannedEnd);
}

export function isOverlapping(
  startA: Date,
  endA: Date,
  startB: Date,
  endB: Date
): boolean {
  return startA <= endB && endA >= startB;
}

export function parseDateSafe(dateStr: string | null | undefined): Date | null {
  if (!dateStr) return null;
  try {
    return parseISO(dateStr);
  } catch {
    return null;
  }
}
