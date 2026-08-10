type Role = "ADMIN" | "MANAGER" | "EMPLOYEE";

interface SessionUser {
  id: string;
  role: Role;
  employeeId?: string | null;
}

export function isAdmin(user: SessionUser | null | undefined): boolean {
  return user?.role === "ADMIN";
}

export function isManager(user: SessionUser | null | undefined): boolean {
  return user?.role === "MANAGER" || user?.role === "ADMIN";
}

export function isEmployee(user: SessionUser | null | undefined): boolean {
  return user?.role === "EMPLOYEE";
}

export function canManageUsers(user: SessionUser | null | undefined): boolean {
  return isAdmin(user);
}

export function canManageEmployees(user: SessionUser | null | undefined): boolean {
  return isManager(user);
}

export function canManageProducts(user: SessionUser | null | undefined): boolean {
  return isAdmin(user);
}

export function canCreateTask(user: SessionUser | null | undefined): boolean {
  return isManager(user);
}

export function canUpdateTask(user: SessionUser | null | undefined): boolean {
  return isManager(user);
}

export function canDeleteTask(user: SessionUser | null | undefined): boolean {
  return isManager(user);
}

export function canRestoreTask(user: SessionUser | null | undefined): boolean {
  return isAdmin(user);
}

export function canReassignTask(user: SessionUser | null | undefined): boolean {
  return isManager(user);
}

export function canUpdateTaskProgress(
  user: SessionUser | null | undefined,
  taskAssigneeId: string | null
): boolean {
  if (!user) return false;
  if (isManager(user)) return true;
  if (isEmployee(user) && user.employeeId === taskAssigneeId) return true;
  return false;
}

export function canViewAllEmployees(user: SessionUser | null | undefined): boolean {
  return isManager(user);
}

export function canViewAllTasks(user: SessionUser | null | undefined): boolean {
  return isManager(user);
}

export function canViewReports(user: SessionUser | null | undefined): boolean {
  return isManager(user);
}

export function canExportData(user: SessionUser | null | undefined): boolean {
  return isManager(user);
}

export function canViewAuditHistory(user: SessionUser | null | undefined): boolean {
  return isAdmin(user);
}

export function requireRole(
  user: SessionUser | null | undefined,
  allowedRoles: Role[]
): boolean {
  if (!user) return false;
  return allowedRoles.includes(user.role);
}