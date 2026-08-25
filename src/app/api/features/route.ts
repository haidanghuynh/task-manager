import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getAiAssistantName, isAiAssistantConfigured, isAiAssistantEnabled } from "@/config/features";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ success: false, error: { code: "UNAUTHORIZED" } }, { status: 401 });
  }

  const roleAllowed = user.role === "ADMIN" || user.role === "MANAGER";
  return NextResponse.json({
    success: true,
    data: {
      aiAssistant: roleAllowed && isAiAssistantEnabled(),
      aiConfigured: roleAllowed && isAiAssistantConfigured(),
      aiAssistantName: roleAllowed ? getAiAssistantName() : null,
    },
  });
}
