import type { NextAuthConfig } from "next-auth";
import { prisma } from "@/lib/prisma";
import { resolvePermissions, type PermissionRole } from "@/lib/permissions";

export const authConfig = {
  pages: {
    signIn: "/login",
  },
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = (user as any).role;
        token.employeeId = (user as any).employeeId;
        token.permissions = (user as any).permissions;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        const databaseUser = token.id
          ? await prisma.user.findUnique({
              where: { id: String(token.id) },
              select: { role: true, employeeId: true, permissions: true, isActive: true },
            })
          : null;
        const role = databaseUser?.isActive ? databaseUser.role as PermissionRole : token.role as PermissionRole;
        (session.user as any).id = token.id;
        (session.user as any).role = role;
        (session.user as any).employeeId = databaseUser?.isActive ? databaseUser.employeeId : token.employeeId;
        (session.user as any).permissions = databaseUser?.isActive
          ? resolvePermissions(role, databaseUser.permissions)
          : token.permissions;
      }
      return session;
    },
  },
  providers: [],
} satisfies NextAuthConfig;
