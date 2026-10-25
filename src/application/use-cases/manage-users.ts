import { and, count, eq, ne, sql } from "drizzle-orm";
import { getDb } from "@infrastructure/db/client";
import { authUsers } from "@infrastructure/db/schema";
import { adminEmails } from "./resolve-role";
import type { Role } from "@domain/value-objects/role";

export class ProtectedUserRoleError extends Error {}
export class UserNotFoundError extends Error {}

export async function listUsers() {
  const configuredAdmins = adminEmails();
  const users = await getDb().select({
    id: authUsers.id,
    name: authUsers.name,
    email: authUsers.email,
    image: authUsers.image,
    role: authUsers.role,
  }).from(authUsers).orderBy(authUsers.email);
  return users.map((user) => ({
    ...user,
    configuredAdmin: Boolean(user.email && configuredAdmins.includes(user.email.trim().toLowerCase())),
    effectiveRole: user.email && configuredAdmins.includes(user.email.trim().toLowerCase()) ? "admin" as const : user.role,
  }));
}

export async function updateUserRole(id: string, role: Role, actorEmail: string) {
  return getDb().transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(728341902)`);
    const [user] = await tx.select().from(authUsers).where(eq(authUsers.id, id)).for("update");
    if (!user) throw new UserNotFoundError("User not found");
    if (user.email?.trim().toLowerCase() === actorEmail.trim().toLowerCase()) {
      throw new ProtectedUserRoleError("You cannot change your own role");
    }
    if (user.email && adminEmails().includes(user.email.trim().toLowerCase())) {
      throw new ProtectedUserRoleError("Users configured in ADMIN_EMAILS remain administrators");
    }
    if (user.role === "admin" && role !== "admin") {
      const [{ total }] = await tx.select({ total: count() }).from(authUsers)
        .where(and(eq(authUsers.role, "admin"), ne(authUsers.id, id)));
      if (total === 0 && adminEmails().length === 0) {
        throw new ProtectedUserRoleError("At least one administrator must remain");
      }
    }
    const [updated] = await tx.update(authUsers).set({ role }).where(eq(authUsers.id, id)).returning({
      id: authUsers.id,
      email: authUsers.email,
      role: authUsers.role,
    });
    return updated;
  });
}
