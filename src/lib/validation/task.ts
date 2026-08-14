import { z } from "zod";

const dateString = z
  .string()
  .min(1)
  .refine((value) => !Number.isNaN(new Date(value).getTime()), "Invalid date")
  .transform((value) => new Date(value));

export const taskStatusSchema = z.enum([
  "PLANNED",
  "IN_PROGRESS",
  "WAITING",
  "COMPLETED",
  "CANCELLED",
]);

export const taskPrioritySchema = z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]);
export const taskWorkTypeSchema = z.enum(["PRODUCT", "DAILY"]);
export const dailyWorkCategorySchema = z.string().trim().min(1).max(100);

export const createTaskSchema = z
  .object({
    taskName: z.string().trim().min(1).max(200),
    description: z.string().trim().max(5000).optional().nullable(),
    workType: taskWorkTypeSchema.default("PRODUCT"),
    dailyCategory: dailyWorkCategorySchema.optional().nullable(),
    productId: z.string().trim().optional().default(""),
    taskNumber: z
      .string()
      .trim()
      .max(40)
      .refine((value) => value === "" || /^[A-Za-z0-9]+(?:[._-][A-Za-z0-9]+)*$/.test(value), {
        message: "Task suffix may contain letters, numbers, dots, underscores, and hyphens",
      })
      .optional()
      .default(""),
    assigneeId: z.string().trim().optional().default(""),
    plannedStartDate: dateString,
    plannedEndDate: dateString.optional().nullable(),
    status: taskStatusSchema.default("PLANNED"),
    priority: taskPrioritySchema.default("MEDIUM"),
    note: z.string().trim().max(5000).optional().nullable(),
  })
  .refine(
    (data) => !data.plannedEndDate || data.plannedEndDate >= data.plannedStartDate,
    { path: ["plannedEndDate"], message: "End date cannot be before start date" },
  )
  .superRefine((data, context) => {
    if (data.workType === "PRODUCT" && !data.productId) {
      context.addIssue({ code: "custom", path: ["productId"], message: "Product is required" });
    }
    if (data.workType === "DAILY" && !data.dailyCategory) {
      context.addIssue({ code: "custom", path: ["dailyCategory"], message: "Daily work category is required" });
    }
  });

export const updateTaskSchema = z.object({
  taskCode: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .regex(/^[A-Za-z0-9._-]+$/, "Task code may contain letters, numbers, dots, underscores, and hyphens")
    .optional(),
  taskName: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(5000).nullable().optional(),
  workType: taskWorkTypeSchema.optional(),
  dailyCategory: dailyWorkCategorySchema.nullable().optional(),
  productId: z.string().trim().nullable().optional(),
  plannedStartDate: dateString.optional(),
  plannedEndDate: dateString.optional(),
  actualStartDate: dateString.nullable().optional(),
  actualEndDate: dateString.nullable().optional(),
  status: taskStatusSchema.optional(),
  progress: z.coerce.number().int().min(0).max(100).optional(),
  priority: taskPrioritySchema.optional(),
  note: z.string().trim().max(5000).nullable().optional(),
});
export const reassignTaskSchema = z.object({
  employeeId: z.string().min(1),
  reason: z.string().trim().max(1000).optional().default(""),
});

export const unassignTaskSchema = z.object({
  reason: z.string().trim().max(1000).optional().default(""),
});
