import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAiRateLimitPerMinute, isAiAssistantConfigured, isAiAssistantEnabled } from "@/config/features";
import { askDeepSeek } from "@/lib/ai/deepseek";
import { recordAuditLog } from "@/lib/audit-log";
import { getCurrentUser } from "@/lib/auth/current-user";

const requestSchema = z.object({
  messages: z.array(z.object({
    role: z.enum(["user", "assistant"]),
    content: z.string().trim().min(1).max(2000),
  })).min(1).max(12),
  language: z.enum(["vi", "ja"]).default("vi"),
  context: z.object({
    pathname: z.string().max(200).optional(),
    search: z.string().max(500).optional(),
    pageState: z.record(
      z.string().max(50),
      z.union([z.string().max(200), z.boolean(), z.null()]),
    ).refine((value) => Object.keys(value).length <= 20).optional(),
  }).optional(),
});

const requestWindows = new Map<string, number[]>();

function exceedsRateLimit(userId: string) {
  const now = Date.now();
  const recent = (requestWindows.get(userId) || []).filter((timestamp) => now - timestamp < 60_000);
  if (recent.length >= getAiRateLimitPerMinute()) {
    requestWindows.set(userId, recent);
    return true;
  }
  recent.push(now);
  requestWindows.set(userId, recent);
  if (requestWindows.size > 500) {
    for (const [key, timestamps] of requestWindows) {
      if (timestamps.every((timestamp) => now - timestamp >= 60_000)) requestWindows.delete(key);
    }
  }
  return false;
}

function errorResponse(code: string, status: number) {
  return NextResponse.json({ success: false, error: { code } }, { status });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return errorResponse("UNAUTHORIZED", 401);
  if (!isAiAssistantEnabled()) return errorResponse("FEATURE_DISABLED", 404);
  if (user.role !== "ADMIN" && user.role !== "MANAGER") return errorResponse("FORBIDDEN", 403);
  if (user.role === "MANAGER" && !user.teamId) return errorResponse("MANAGER_TEAM_REQUIRED", 403);
  if (!isAiAssistantConfigured()) return errorResponse("AI_NOT_CONFIGURED", 503);
  if (exceedsRateLimit(user.id)) return errorResponse("RATE_LIMITED", 429);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("INVALID_JSON", 400);
  }
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: { code: "VALIDATION_ERROR", details: parsed.error.flatten() } }, { status: 400 });
  }

  try {
    const result = await askDeepSeek({
      user,
      messages: parsed.data.messages,
      language: parsed.data.language,
      context: parsed.data.context,
    });
    await recordAuditLog({
      request,
      actor: user,
      action: "QUERY",
      entityType: "AI_ASSISTANT",
      entityLabel: result.toolsUsed.join(", ") || "conversation",
      details: {
        toolsUsed: result.toolsUsed,
        model: result.model,
        queryMode: result.queryMode,
        reasoningEnabled: result.reasoningEnabled,
        messageCount: parsed.data.messages.length,
        lastMessageLength: parsed.data.messages.at(-1)?.content.length || 0,
      },
    });
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    const code = error instanceof Error ? error.message : "AI_REQUEST_FAILED";
    const publicCodes = new Set(["AI_NOT_CONFIGURED", "AI_PROVIDER_ERROR", "AI_EMPTY_RESPONSE", "AI_TOOL_LIMIT_REACHED"]);
    console.error("AI assistant request failed", error);
    return errorResponse(publicCodes.has(code) ? code : "AI_REQUEST_FAILED", code === "AI_NOT_CONFIGURED" ? 503 : 502);
  }
}
