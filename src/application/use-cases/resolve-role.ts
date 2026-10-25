import { eq } from "drizzle-orm";
import { getDb } from "@infrastructure/db/client";
import { authUsers } from "@infrastructure/db/schema";
import { parseRole, type Role } from "@domain/value-objects/role";

export const DEMO_ACCOUNTS: Record<string, Role> = {
  "demo@omnimarket.local": "admin",
  "operator@omnimarket.local": "operator",
  "viewer@omnimarket.local": "viewer",
};

function isProduction() {
  return process.env.NODE_ENV === "production" || process.env.APP_ENV === "production";
}

export function adminEmails() {
  return (process.env.ADMIN_EMAILS ?? "").split(",").map((email) => email.trim().toLowerCase()).filter(Boolean);
}

export async function resolveRole(email: string): Promise<Role> {
  const normalized = email.trim().toLowerCase();
  if (adminEmails().includes(normalized)) return "admin";
  if (!isProduction()) {
    if (DEMO_ACCOUNTS[normalized]) return DEMO_ACCOUNTS[normalized];
    if (normalized === process.env.DEMO_EMAIL?.trim().toLowerCase()) return "admin";
  }
  if (!process.env.DATABASE_URL) return "viewer";
  const [user] = await getDb().select({ role: authUsers.role }).from(authUsers).where(eq(authUsers.email, normalized)).limit(1);
  return parseRole(user?.role);
}
