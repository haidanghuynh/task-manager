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

export function isOverdue(plannedEnd: Date, status: string, actualEnd?: Date | null): boolean {
  if (actualEnd) return isAfter(actualEnd, plannedEnd);
  if (status === "COMPLETED" || status === "CANCELLED") return false;
  return isBefore(plannedEnd, new Date());
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