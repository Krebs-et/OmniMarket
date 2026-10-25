import { NextResponse } from "next/server";
import { authorize } from "@lib/authorize";
import { listUsers } from "@application/use-cases/manage-users";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const access = await authorize(request, "users:manage");
  if ("response" in access) return access.response;
  return NextResponse.json(await listUsers());
}
