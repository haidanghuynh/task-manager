export const APP_PERMISSIONS = [
  "TASK_VIEW",
  "TASK_CREATE",
  "TASK_EDIT",
  "TASK_DELETE",
  "DAILY_TASK_CREATE",
  "DAILY_TASK_EDIT",
  "DAILY_TASK_DELETE",
  "TASK_ASSIGN",
  "TASK_IMPORT_EXPORT",
  "TASK_UPDATE_OWN",
  "SCHEDULE_VIEW",
  "REPORT_VIEW",
  "NIPPO_VIEW",
  "NIPPO_SUBMIT",
  "NIPPO_MANAGE",
  "EMPLOYEE_VIEW",
  "EMPLOYEE_MANAGE",
  "EMPLOYEE_IMPORT_EXPORT",
  "TEAM_MANAGE",
] as const;

export type AppPermission = (typeof APP_PERMISSIONS)[number];
export type PermissionRole = "ADMIN" | "MANAGER" | "EMPLOYEE";

const employeeDefaults: AppPermission[] = [
  "TASK_VIEW",
  "TASK_UPDATE_OWN",
  "SCHEDULE_VIEW",
  "REPORT_VIEW",
  "NIPPO_VIEW",
  "NIPPO_SUBMIT",
  "EMPLOYEE_VIEW",
];

export const DEFAULT_PERMISSIONS: Record<PermissionRole, AppPermission[]> = {
  ADMIN: [...APP_PERMISSIONS],
  MANAGER: [...APP_PERMISSIONS],
  EMPLOYEE: employeeDefaults,
};

export function parsePermissions(value: string | null | undefined): AppPermission[] | null {
  if (value == null) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return [...new Set(parsed.filter((item): item is AppPermission =>
      typeof item === "string" && APP_PERMISSIONS.includes(item as AppPermission),
    ))];
  } catch {
    return [];
  }
}

export function resolvePermissions(role: PermissionRole, value?: string | null): AppPermission[] {
  if (role === "ADMIN") return [...APP_PERMISSIONS];
  return withPermissionDependencies(parsePermissions(value) ?? [...DEFAULT_PERMISSIONS[role]]);
}

export function withPermissionDependencies(values: AppPermission[]): AppPermission[] {
  const permissions = new Set(values);
  const taskActions: AppPermission[] = [
    "TASK_CREATE", "TASK_EDIT", "TASK_DELETE",
    "DAILY_TASK_CREATE", "DAILY_TASK_EDIT", "DAILY_TASK_DELETE",
    "TASK_ASSIGN", "TASK_IMPORT_EXPORT", "TASK_UPDATE_OWN",
  ];
  if (taskActions.some((permission) => permissions.has(permission))) permissions.add("TASK_VIEW");
  if (permissions.has("NIPPO_SUBMIT") || permissions.has("NIPPO_MANAGE")) permissions.add("NIPPO_VIEW");
  if (
    permissions.has("EMPLOYEE_MANAGE") ||
    permissions.has("EMPLOYEE_IMPORT_EXPORT") ||
    permissions.has("TASK_CREATE") ||
    permissions.has("DAILY_TASK_CREATE") ||
    permissions.has("TASK_ASSIGN") ||
    permissions.has("TEAM_MANAGE")
  ) permissions.add("EMPLOYEE_VIEW");
  return APP_PERMISSIONS.filter((permission) => permissions.has(permission));
}

export function normalizePermissions(role: PermissionRole, value: unknown): string | null {
  if (role === "ADMIN") return null;
  if (!Array.isArray(value)) return null;
  const permissions = [...new Set(value.filter((item): item is AppPermission =>
    typeof item === "string" && APP_PERMISSIONS.includes(item as AppPermission),
  ))];
  return JSON.stringify(withPermissionDependencies(permissions));
}

export interface PermissionUser {
  role: PermissionRole;
  permissions?: AppPermission[] | null;
}

export function hasPermission(user: PermissionUser | null | undefined, permission: AppPermission): boolean {
  if (!user) return false;
  if (user.role === "ADMIN") return true;
  return (user.permissions ?? DEFAULT_PERMISSIONS[user.role]).includes(permission);
}
