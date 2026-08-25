import "server-only";

function enabled(value: string | undefined) {
  return value?.trim().toLowerCase() === "true";
}

export function isAiAssistantEnabled() {
  return enabled(process.env.AI_ASSISTANT_ENABLED);
}

export function isAiAssistantConfigured() {
  return Boolean(process.env.DEEPSEEK_API_KEY?.trim());
}

export function getAiAssistantModel() {
  return process.env.AI_MODEL?.trim() || "deepseek-v4-flash";
}

export function getAiAssistantName() {
  return process.env.AI_ASSISTANT_NAME?.trim().slice(0, 60) || "Tiểu Mỹ";
}

export function getAiRateLimitPerMinute() {
  const value = Number.parseInt(process.env.AI_RATE_LIMIT_PER_MINUTE || "10", 10);
  return Number.isFinite(value) && value > 0 ? Math.min(value, 60) : 10;
}

export function getAiDailyCapacityHours() {
  const value = Number.parseFloat(process.env.AI_DAILY_CAPACITY_HOURS || "8");
  return Number.isFinite(value) && value > 0 && value <= 24 ? value : 8;
}
