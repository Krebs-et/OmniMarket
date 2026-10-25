export const ROLES = ["admin", "operator", "viewer"] as const;
export type Role = (typeof ROLES)[number];

export const PERMISSIONS = ["orders:read", "orders:write", "catalog:read", "catalog:write", "users:manage", "observability:read"] as const;
export type Permission = (typeof PERMISSIONS)[number];

const grants: Record<Role, readonly Permission[]> = {
  admin: ["orders:read", "orders:write", "catalog:read", "catalog:write", "users:manage", "observability:read"],
  operator: ["orders:read", "orders:write", "catalog:read"],
  viewer: ["orders:read", "catalog:read"],
};

export function can(role: Role, permission: Permission) {
  return grants[role].includes(permission);
}

export function parseRole(value: unknown): Role {
  return ROLES.find((role) => role === value) ?? "viewer";
}
