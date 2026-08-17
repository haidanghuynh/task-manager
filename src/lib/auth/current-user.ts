import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/prisma";
import { resolvePermissions, type AppPermission } from "@/lib/permissions";

export const APP_ROLES = ["ADMIN", "MANAGER", "EMPLOYEE"] as const;

export type AppRole = (typeof APP_ROLES)[number];

export interface AppUser {
  id: string;
  role: AppRole;
  employeeId: string | null;
  teamId: string | null;
  permissions: AppPermission[];
}
export async function getCurrentUser(): Promise<AppUser | null> {
  const session = await auth();
  const sessionUser = session?.user as
    | { id?: string; role?: string; employeeId?: string | null }
    | undefined;

  if (!sessionUser?.id) return null;

  const user = await prisma.user.findUnique({
    where: { id: sessionUser.id },
    select: {
      id: true,
      role: true,
      permissions: true,
      employeeId: true,
      isActive: true,
      employee: { select: { isActive: true, teamId: true } },
    },
  });

  if (!user?.isActive || !APP_ROLES.includes(user.role as AppRole)) return null;

  if (
    (user.role === "EMPLOYEE" || user.role === "MANAGER") &&
    (!user.employeeId || !user.employee?.isActive)
  ) {
    return null;
  }

  return {
    id: user.id,
    role: user.role as AppRole,
    employeeId: user.employeeId,
    teamId: user.employee?.teamId ?? null,
    permissions: resolvePermissions(user.role as AppRole, user.permissions),
  };
}

/**
 * Returns the employee IDs an Employee account may read.
 * Employees without a team remain limited to their own data.
 * ADMIN and MANAGER are unrestricted, so this helper returns null for them.
 */
export async function getVisibleEmployeeIds(user: AppUser): Promise<string[] | null> {
  if (user.role !== "EMPLOYEE") return null;
  if (!user.employeeId) return [];
  if (!user.teamId) return [user.employeeId];

  const members = await prisma.employee.findMany({
    where: { teamId: user.teamId, isActive: true },
    select: { id: true },
  });

  const ids = members.map((member) => member.id);
  return ids.includes(user.employeeId) ? ids : [user.employeeId, ...ids];
}
