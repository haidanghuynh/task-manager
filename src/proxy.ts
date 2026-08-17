import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export default auth(async (req) => {
  const { pathname } = req.nextUrl;
  const sessionUser = req.auth?.user as { id?: string } | undefined;
  const databaseUser = sessionUser?.id
    ? await prisma.user.findUnique({
        where: { id: sessionUser.id },
        select: {
          isActive: true,
          role: true,
          employeeId: true,
          employee: { select: { isActive: true } },
        },
      })
    : null;
  const isLoggedIn = Boolean(
    databaseUser?.isActive &&
    ((databaseUser.role !== "EMPLOYEE" && databaseUser.role !== "MANAGER") ||
      (databaseUser.employeeId && databaseUser.employee?.isActive)),
  );

  if (pathname === "/login") {
    if (isLoggedIn) {
      return NextResponse.redirect(new URL("/dashboard", req.url));
    }
    return NextResponse.next();
  }

  if (!isLoggedIn) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
