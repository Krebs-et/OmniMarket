import { NextResponse } from "next/server";
import { authorize } from "@lib/authorize";
import { listUsers } from "@application/use-cases/manage-users";
import { withApiObservability } from "@lib/api-observability";

export const dynamic = "force-dynamic";

async function listUsersRoute(request: Request) {
  const access = await authorize(request, "users:manage");
  if (access.response) return access.response;
  return NextResponse.json(await listUsers());
}

export const GET = withApiObservability("GET", "/api/users", listUsersRoute);
