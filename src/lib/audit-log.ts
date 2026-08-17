import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

type AuditActor = {
  id: string;
  name?: string | null;
  username?: string | null;
};

type AuditInput = {
  request: NextRequest;
  actor: AuditActor;
  action: string;
  entityType: string;
  entityId?: string | null;
  entityLabel?: string | null;
  details?: unknown;
};

const sensitiveKey = /password|hash|secret|token|authorization|cookie/i;

function sanitize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitize);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !sensitiveKey.test(key))
      .map(([key, item]) => [key, sanitize(item)]),
  );
}

function requestIp(request: NextRequest) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || request.headers.get("x-real-ip")
    || null;
}

export async function recordAuditLog(input: AuditInput) {
  try {
    const databaseActor = await prisma.user.findUnique({
      where: { id: input.actor.id },
      select: { name: true, username: true },
    });
    await prisma.auditLog.create({
      data: {
        actorId: input.actor.id,
        actorName: databaseActor?.name || input.actor.name || "Unknown",
        actorUsername: databaseActor?.username || input.actor.username || "unknown",
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId || null,
        entityLabel: input.entityLabel || null,
        details: input.details === undefined ? null : JSON.stringify(sanitize(input.details)),
        ipAddress: requestIp(input.request),
        userAgent: input.request.headers.get("user-agent")?.slice(0, 500) || null,
      },
    });
  } catch (error) {
    console.error("Failed to write audit log", error);
  }
}
