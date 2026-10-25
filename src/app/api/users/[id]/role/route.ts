import { NextResponse } from "next/server";
import { updateUserRoleSchema } from "@application/dtos/order.dto";
import { ProtectedUserRoleError, updateUserRole, UserNotFoundError } from "@application/use-cases/manage-users";
import { authorize } from "@lib/authorize";
import { withApiObservability } from "@lib/api-observability";

export const dynamic = "force-dynamic";

async function updateUserRoleRoute(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await authorize(request, "users:manage");
  if (access.response) return access.response;
  const { id } = await params;
  const parsed = updateUserRoleSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  try {
    return NextResponse.json(await updateUserRole(id, parsed.data.role, access.session.email));
  } catch (error) {
    if (error instanceof UserNotFoundError) return NextResponse.json({ error: "User not found" }, { status: 404 });
    if (error instanceof ProtectedUserRoleError) return NextResponse.json({ error: error.message }, { status: 409 });
    throw error;
  }
}

export const PATCH = withApiObservability("PATCH", "/api/users/[id]/role", updateUserRoleRoute);
