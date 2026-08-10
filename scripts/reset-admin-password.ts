import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

function argumentValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main() {
  if (process.argv.includes("--list") || process.env.RESET_ADMIN_LIST === "1") {
    const admins = await prisma.user.findMany({
      where: { role: "ADMIN" },
      select: { username: true, name: true, isActive: true },
      orderBy: { username: "asc" },
    });
    if (admins.length === 0) {
      console.log("No administrator account exists.");
      return;
    }
    for (const admin of admins) {
      console.log(`${admin.username}\t${admin.name}\t${admin.isActive ? "active" : "inactive"}`);
    }
    return;
  }

  const username = (argumentValue("--username") || process.env.RESET_ADMIN_USERNAME || "").trim().toLowerCase();
  if (!username) throw new Error("Administrator username is required.");

  // The shell wrapper sends the password through stdin so it is not exposed in
  // command-line arguments or shell history.
  const password = readFileSync(0, "utf8");
  if (password.length < 12) throw new Error("The new password must contain at least 12 characters.");
  if (password.includes("\n") || password.includes("\r")) throw new Error("The password must not contain a line break.");

  const admin = await prisma.user.findUnique({ where: { username } });
  if (!admin || admin.role !== "ADMIN") {
    throw new Error("Administrator account not found. No account was changed.");
  }

  await prisma.user.update({
    where: { id: admin.id },
    data: { passwordHash: await bcrypt.hash(password, 12) },
  });

  console.log(`Password reset successfully for administrator: ${admin.username}`);
  if (!admin.isActive) console.log("Warning: this administrator is inactive and still cannot sign in.");
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
