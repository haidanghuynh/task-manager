import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/prisma";

export const APP_ROLES = ["ADMIN", "MANAGER", "EMPLOYEE"] as const;

export type AppRole = (typeof APP_ROLES)[number];

export interface AppUser {
  id: string;
  role: AppRole;
  employeeId: string | null;
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
      employeeId: true,
      isActive: true,
      employee: { select: { isActive: true } },
    },
  });

  if (!user?.isActive || !APP_ROLES.includes(user.role as AppRole)) return null;

  if (
    user.role === "EMPLOYEE" &&
    (!user.employeeId || !user.employee?.isActive)
  ) {
    return null;
  }

  return {
    id: user.id,
    role: user.role as AppRole,
    employeeId: user.employeeId,
  };
}
