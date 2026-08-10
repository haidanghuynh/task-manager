import type { Prisma } from "@prisma/client";

export async function deleteEmployeesPermanently(
  tx: Prisma.TransactionClient,
  employeeIds: string[],
  actingAdminId: string,
) {
  const ids = [...new Set(employeeIds)];
  if (ids.length === 0) return { employeesDeleted: 0, accountsDeleted: 0 };

  const linkedUsers = await tx.user.findMany({
    where: { employeeId: { in: ids } },
    select: { id: true },
  });
  // Keep the currently signed-in Admin account if it is linked to an employee
  // being deleted. The employee relation is set to null by the database FK.
  const accountIds = linkedUsers.map((user) => user.id).filter((id) => id !== actingAdminId);

  await tx.teamMember.deleteMany({ where: { employeeId: { in: ids } } });
  await tx.team.updateMany({ where: { leadId: { in: ids } }, data: { leadId: null } });
  await tx.task.updateMany({ where: { currentAssigneeId: { in: ids } }, data: { currentAssigneeId: null } });

  await tx.taskAssignmentHistory.deleteMany({
    where: {
      OR: [
        { employeeId: { in: ids } },
        ...(accountIds.length > 0 ? [{ assignedById: { in: accountIds } }] : []),
      ],
    },
  });

  if (accountIds.length > 0) {
    // Tasks themselves remain available; ownership moves to the Admin who
    // performs the permanent deletion.
    await tx.task.updateMany({ where: { createdById: { in: accountIds } }, data: { createdById: actingAdminId } });
    await tx.taskComment.updateMany({ where: { deletedById: { in: accountIds } }, data: { deletedById: null } });
    await tx.taskComment.deleteMany({ where: { authorId: { in: accountIds } } });
    await tx.taskStatusHistory.deleteMany({ where: { changedById: { in: accountIds } } });
    await tx.taskChangeLog.deleteMany({ where: { changedById: { in: accountIds } } });
    await tx.user.deleteMany({ where: { id: { in: accountIds } } });
  }

  const deleted = await tx.employee.deleteMany({ where: { id: { in: ids } } });
  return { employeesDeleted: deleted.count, accountsDeleted: accountIds.length };
}
