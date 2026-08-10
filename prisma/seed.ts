import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding database...");

  // Clean existing data
  await prisma.taskComment.deleteMany();
  await prisma.taskChangeLog.deleteMany();
  await prisma.taskStatusHistory.deleteMany();
  await prisma.taskAssignmentHistory.deleteMany();
  await prisma.task.deleteMany();
  await prisma.user.deleteMany();
  await prisma.employee.deleteMany();
  await prisma.product.deleteMany();

  // Create products
  const products = await Promise.all([
    prisma.product.create({ data: { code: "ZONE", name: "Zone", color: "#22C55E" } }),
    prisma.product.create({ data: { code: "GATE", name: "Gate", color: "#3B82F6" } }),
    prisma.product.create({ data: { code: "HUNTER", name: "Hunter", color: "#F97316" } }),
  ]);
  const [zone, gate, hunter] = products;
  console.log("Products created:", products.length);

  // Create employees
  const employeeData = [
    { code: "NV001", name: "Nguyễn Văn An", email: "an.nguyen@example.com", department: "Phát triển", position: "Senior Dev" },
    { code: "NV002", name: "Trần Thị Bình", email: "binh.tran@example.com", department: "Phát triển", position: "Dev" },
    { code: "NV003", name: "Lê Văn Cường", email: "cuong.le@example.com", department: "Kiểm thử", position: "QA Lead" },
    { code: "NV004", name: "Phạm Thị Dung", email: "dung.pham@example.com", department: "Kiểm thử", position: "QA" },
    { code: "NV005", name: "Hoàng Văn Em", email: "em.hoang@example.com", department: "Thiết kế", position: "Designer" },
    { code: "NV006", name: "Ngô Thị Hương", email: "huong.ngo@example.com", department: "Phát triển", position: "Dev" },
    { code: "NV007", name: "Đặng Văn Giang", email: "giang.dang@example.com", department: "Phát triển", position: "Junior Dev" },
    { code: "NV008", name: "Bùi Thị Hoa", email: "hoa.bui@example.com", department: "Hỗ trợ", position: "Support" },
    { code: "NV009", name: "Vũ Văn Inh", email: "inh.vu@example.com", department: "Phát triển", position: "Dev" },
    { code: "NV010", name: "Lý Thị Khánh", email: "khanh.ly@example.com", department: "Kiểm thử", position: "QA" },
  ];

  const employees = await Promise.all(
    employeeData.map((e) =>
      prisma.employee.create({
        data: {
          employeeCode: e.code,
          fullName: e.name,
          email: e.email,
          department: e.department,
          position: e.position,
        },
      })
    )
  );
  console.log("Employees created:", employees.length);

  // Create users
  const password = await hash("password123", 10);

  const admin = await prisma.user.create({
    data: {
      name: "Admin",
      username: "admin",
      passwordHash: password,
      role: "ADMIN",
      isActive: true,
    },
  });

  const manager = await prisma.user.create({
    data: {
      name: "Manager",
      username: "manager",
      passwordHash: password,
      role: "MANAGER",
      isActive: true,
    },
  });

  await Promise.all([
    prisma.user.create({
      data: {
        name: employees[0].fullName,
        username: "employee1",
        passwordHash: password,
        role: "EMPLOYEE",
        employeeId: employees[0].id,
        isActive: true,
      },
    }),
    prisma.user.create({
      data: {
        name: employees[1].fullName,
        username: "employee2",
        passwordHash: password,
        role: "EMPLOYEE",
        employeeId: employees[1].id,
        isActive: true,
      },
    }),
    prisma.user.create({
      data: {
        name: employees[2].fullName,
        username: "employee3",
        passwordHash: password,
        role: "EMPLOYEE",
        employeeId: employees[2].id,
        isActive: true,
      },
    }),
  ]);
  console.log("Users created: 5");

  // Helper: create task with assignment and status history
  async function createTask(data: {
    code: string;
    name: string;
    product: typeof zone;
    assignee: typeof employees[0];
    creator: typeof manager;
    start: Date;
    end: Date;
    status?: string;
    progress?: number;
    priority?: string;
    actualEnd?: Date;
    description?: string;
  }) {
    const task = await prisma.task.create({
      data: {
        taskCode: data.code,
        taskName: data.name,
        description: data.description ?? null,
        productId: data.product.id,
        currentAssigneeId: data.assignee.id,
        createdById: data.creator.id,
        plannedStartDate: data.start,
        plannedEndDate: data.end,
        actualStartDate: data.start,
        actualEndDate: data.actualEnd ?? null,
        status: (data.status as any) ?? "PLANNED",
        progress: data.progress ?? 0,
        priority: (data.priority as any) ?? "MEDIUM",
      },
    });

    // Initial assignment history
    await prisma.taskAssignmentHistory.create({
      data: {
        taskId: task.id,
        employeeId: data.assignee.id,
        assignedById: data.creator.id,
        assignedFrom: data.start,
        assignedUntil: data.status === "COMPLETED" ? (data.actualEnd ?? data.end) : null,
      },
    });

    // Initial status history
    await prisma.taskStatusHistory.create({
      data: {
        taskId: task.id,
        oldStatus: "PLANNED",
        newStatus: (data.status as any) ?? "PLANNED",
        changedById: data.creator.id,
      },
    });

    return task;
  }

  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth(); // 0-11

  const tasksToCreate = [
    // Zone tasks
    { code: "ZONE-2026-0001", name: "Phát triển module Zone dashboard", product: zone, assignee: employees[0], start: new Date(y, m, 1), end: new Date(y, m, 15), status: "IN_PROGRESS", progress: 60 },
    { code: "ZONE-2026-0002", name: "Fix bug Zone notification", product: zone, assignee: employees[1], start: new Date(y, m, 5), end: new Date(y, m, 10), status: "COMPLETED", progress: 100, actualEnd: new Date(y, m, 10) },
    { code: "ZONE-2026-0003", name: "Code review Zone backend", product: zone, assignee: employees[0], start: new Date(y, m, 16), end: new Date(y, m, 25), status: "PLANNED", progress: 0 },
    { code: "ZONE-2026-0004", name: "Viết test cho Zone API", product: zone, assignee: employees[6], start: new Date(y, m, 3), end: new Date(y, m, 14), status: "IN_PROGRESS", progress: 40 },
    { code: "ZONE-2026-0005", name: "Deploy Zone staging", product: zone, assignee: employees[8], start: new Date(y, m, 20), end: new Date(y, m, 28), status: "PLANNED", progress: 0 },
    { code: "ZONE-2026-0006", name: "Tài liệu Zone API", product: zone, assignee: employees[2], start: new Date(y, m, 1), end: new Date(y, m, 7), status: "COMPLETED", progress: 100, actualEnd: new Date(y, m, 6) },
    { code: "ZONE-2026-0007", name: "Tối ưu database Zone", product: zone, assignee: employees[0], start: new Date(y, m, 26), end: new Date(y, m + 1, 5), status: "PLANNED", progress: 0 },

    // Gate tasks
    { code: "GATE-2026-0001", name: "Thiết kế Gate UI mới", product: gate, assignee: employees[4], start: new Date(y, m, 2), end: new Date(y, m, 18), status: "IN_PROGRESS", progress: 35 },
    { code: "GATE-2026-0002", name: "Phát triển Gate auth module", product: gate, assignee: employees[5], start: new Date(y, m, 1), end: new Date(y, m, 12), status: "COMPLETED", progress: 100, actualEnd: new Date(y, m, 11) },
    { code: "GATE-2026-0003", name: "Kiểm thử Gate integration", product: gate, assignee: employees[3], start: new Date(y, m, 8), end: new Date(y, m, 20), status: "IN_PROGRESS", progress: 70 },
    { code: "GATE-2026-0004", name: "Thiết lập CI/CD Gate", product: gate, assignee: employees[8], start: new Date(y, m, 10), end: new Date(y, m, 17), status: "COMPLETED", progress: 100, actualEnd: new Date(y, m, 16) },
    { code: "GATE-2026-0005", name: "Gate performance optimization", product: gate, assignee: employees[5], start: new Date(y, m, 15), end: new Date(y, m, 28), status: "PLANNED", progress: 0 },
    { code: "GATE-2026-0006", name: "Gate security audit", product: gate, assignee: employees[7], start: new Date(y, m, 1), end: new Date(y, m, 5), status: "CANCELLED", progress: 0 },
    { code: "GATE-2026-0007", name: "Gate localization tiếng Nhật", product: gate, assignee: employees[9], start: new Date(y, m, 18), end: new Date(y, m + 1, 2), status: "PLANNED", progress: 0 },

    // Hunter tasks
    { code: "HUNTER-2026-0001", name: "Xây dựng Hunter core engine", product: hunter, assignee: employees[6], start: new Date(y, m, 1), end: new Date(y, m, 22), status: "IN_PROGRESS", progress: 25 },
    { code: "HUNTER-2026-0002", name: "Hunter data pipeline", product: hunter, assignee: employees[1], start: new Date(y, m, 5), end: new Date(y, m, 19), status: "IN_PROGRESS", progress: 50 },
    { code: "HUNTER-2026-0003", name: "Hunter report generation", product: hunter, assignee: employees[2], start: new Date(y, m, 10), end: new Date(y, m, 25), status: "PLANNED", progress: 0 },
    { code: "HUNTER-2026-0004", name: "Hunter API design", product: hunter, assignee: employees[5], start: new Date(y, m, 1), end: new Date(y, m, 8), status: "COMPLETED", progress: 100, actualEnd: new Date(y, m, 7) },
    { code: "HUNTER-2026-0005", name: "Hunter machine learning model", product: hunter, assignee: employees[0], start: new Date(y, m, 20), end: new Date(y, m + 1, 10), status: "PLANNED", progress: 0, priority: "HIGH" },
    { code: "HUNTER-2026-0006", name: "Hunter dashboard analytics", product: hunter, assignee: employees[8], start: new Date(y, m, 12), end: new Date(y, m, 24), status: "IN_PROGRESS", progress: 80 },

    // Overdue task
    { code: "ZONE-2026-0008", name: "Zone security patch", product: zone, assignee: employees[7], start: new Date(y, m - 1, 15), end: new Date(y, m - 1, 28), status: "IN_PROGRESS", progress: 30, priority: "URGENT" },

    // Waiting task
    { code: "GATE-2026-0008", name: "Gate client feedback integration", product: gate, assignee: employees[9], start: new Date(y, m, 15), end: new Date(y, m, 22), status: "WAITING", progress: 0 },
  ];

  for (const t of tasksToCreate) {
    await createTask({
      code: t.code,
      name: t.name,
      product: t.product,
      assignee: t.assignee,
      creator: manager,
      start: t.start,
      end: t.end,
      status: t.status,
      progress: t.progress,
      actualEnd: (t as any).actualEnd,
      priority: (t as any).priority,
    });
  }

  console.log("Tasks created:", tasksToCreate.length);

  // Create reassignment example
  const taskToReassign = await prisma.task.findFirst({ where: { taskCode: "ZONE-2026-0004" } });
  if (taskToReassign) {
    await prisma.taskAssignmentHistory.updateMany({
      where: { taskId: taskToReassign.id, assignedUntil: null },
      data: { assignedUntil: new Date(y, m, 8), reason: "Chuyển task do nhân viên ưu tiên việc khác" },
    });

    await prisma.taskAssignmentHistory.create({
      data: {
        taskId: taskToReassign.id,
        employeeId: employees[9].id,
        assignedById: manager.id,
        assignedFrom: new Date(y, m, 9),
        reason: "Chuyển từ NV007 sang NV010",
      },
    });

    await prisma.task.update({
      where: { id: taskToReassign.id },
      data: { currentAssigneeId: employees[9].id },
    });

    await prisma.taskChangeLog.create({
      data: {
        taskId: taskToReassign.id,
        changedById: manager.id,
        fieldName: "currentAssignee",
        oldValue: employees[6].id,
        newValue: employees[9].id,
      },
    });
    console.log("Reassignment example created");
  }

  console.log("Seed complete!");
  console.log("\nDefault accounts (password: password123):");
  console.log("  admin@example.com     (ADMIN)");
  console.log("  manager@example.com   (MANAGER)");
  console.log("  employee1@example.com (EMPLOYEE - Nguyễn Văn An)");
  console.log("  employee2@example.com (EMPLOYEE - Trần Thị Bình)");
  console.log("  employee3@example.com (EMPLOYEE - Lê Văn Cường)");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
