import { z } from "zod";

const dateKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date");

export const nippoItemSchema = z.object({
  taskId: z.string().trim().min(1).nullable().optional(),
  title: z.string().trim().min(1).max(200),
  workContent: z.string().trim().max(5000).nullable().optional(),
  result: z.string().trim().max(5000).nullable().optional(),
  hours: z.coerce.number().min(0).max(24),
  progressBefore: z.coerce.number().int().min(0).max(100).nullable().optional(),
  progressAfter: z.coerce.number().int().min(0).max(100).nullable().optional(),
});

export const saveNippoSchema = z.object({
  reportDate: dateKey,
  status: z.enum(["DRAFT", "SUBMITTED"]),
  summary: z.string().trim().max(5000).nullable().optional(),
  blockers: z.string().trim().max(5000).nullable().optional(),
  nextPlan: z.string().trim().max(5000).nullable().optional(),
  items: z.array(nippoItemSchema).max(50),
});

export const saveAbsenceSchema = z.object({
  absenceDate: dateKey,
  teamId: z.string().min(1),
  employeeId: z.string().min(1),
  absenceType: z.enum(["PAID", "SICK", "PERSONAL", "OTHER"]),
  period: z.enum(["FULL", "HALF_AM", "HALF_PM"]),
  reason: z.string().trim().max(1000).nullable().optional(),
});
