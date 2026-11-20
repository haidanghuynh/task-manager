import { prisma } from "@/lib/prisma";
import type { AppUser } from "@/lib/auth/current-user";

/**
 * Employee ids whose expiring test assets (environments/devices) a user should be
 * warned about: own assets, assets of teams they lead (Team.leadId) and, for a
 * MANAGER, assets of their current team. ADMIN gets null (sees everything).
 */
export async function expiringEmployeeIds(user: AppUser): Promise<string[] | null> {
  if (user.role === "ADMIN") return null;

  const ids = new Set<string>();
  if (user.employeeId) ids.add(user.employeeId);

  if (user.employeeId) {
    const ledTeams = await prisma.team.findMany({ where: { leadId: user.employeeId }, select: { id: true } });
    if (ledTeams.length > 0) {
      const members = await prisma.employee.findMany({
        where: { teamId: { in: ledTeams.map((team) => team.id) }, isActive: true },
        select: { id: true },
      });
      for (const member of members) ids.add(member.id);
    }
  }

  if (user.role === "MANAGER" && user.teamId) {
    const members = await prisma.employee.findMany({
      where: { teamId: user.teamId, isActive: true },
      select: { id: true },
    });
    for (const member of members) ids.add(member.id);
  }

  return [...ids];
}
