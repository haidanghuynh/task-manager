import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

async function main() {
  const activeAdminCount = await prisma.user.count({
    where: { role: "ADMIN", isActive: true },
  });

  if (process.argv.includes("--check")) {
    if (activeAdminCount > 0) {
      console.log(`Active administrator account found (${activeAdminCount}).`);
      return;
    }

    console.error("No active administrator account exists.");
    process.exitCode = 2;
    return;
  }

  // Never create a second bootstrap administrator. Additional accounts belong
  // to the web-based account management flow.
  if (activeAdminCount > 0) {
    console.log("An active administrator already exists; bootstrap skipped.");
    return;
  }

  const name = requiredEnvironment("BOOTSTRAP_ADMIN_NAME");
  const username = requiredEnvironment("BOOTSTRAP_ADMIN_USERNAME").toLowerCase();
  const password = requiredEnvironment("BOOTSTRAP_ADMIN_PASSWORD");

  if (!/^[a-z0-9._-]{3,50}$/.test(username)) {
    throw new Error("BOOTSTRAP_ADMIN_USERNAME must be 3-50 characters and use only letters, numbers, dot, underscore or hyphen.");
  }
  if (password.length < 8) {
    throw new Error("BOOTSTRAP_ADMIN_PASSWORD must contain at least 8 characters.");
  }

  const existingUser = await prisma.user.findUnique({ where: { username } });
  if (existingUser) {
    throw new Error(
      "This username already belongs to a non-bootstrap account. Use another username or manage the account in the web UI.",
    );
  }

  await prisma.user.create({
    data: {
      name,
      username,
      passwordHash: await bcrypt.hash(password, 12),
      role: "ADMIN",
      isActive: true,
    },
  });

  console.log(`Initial administrator created: ${username}`);
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
