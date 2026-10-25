import { NextResponse } from "next/server";
import { getAnalytics } from "@application/use-cases/get-analytics";
import { authorize } from "@lib/authorize";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const access = await authorize(request, "orders:read");
  if ("response" in access) return access.response;
  return NextResponse.json(await getAnalytics());
}
