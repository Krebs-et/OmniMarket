import { NextResponse } from "next/server";
import { can, type Permission } from "@domain/value-objects/role";
import { getSession } from "./auth";
import { recordAuthenticationFailure } from "./security";

// Returns the session when the caller holds the permission, otherwise a ready 401/403 response.
export async function authorize(request: Request, permission: Permission) {
  const session = await getSession();
  if (!session) {
    await recordAuthenticationFailure(request);
    return { response: NextResponse.json({ error: "Authentication required" }, { status: 401 }) } as const;
  }
  if (!can(session.role, permission)) {
    return { response: NextResponse.json({ error: "Insufficient permissions" }, { status: 403 }) } as const;
  }
  return { session } as const;
}
