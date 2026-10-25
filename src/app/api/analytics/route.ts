import { NextResponse } from "next/server";
import { getAnalytics } from "@application/use-cases/get-analytics";
import { authorize } from "@lib/authorize";
import { withApiObservability } from "@lib/api-observability";

export const dynamic = "force-dynamic";

async function getAnalyticsRoute(request: Request) {
  const access = await authorize(request, "orders:read");
  if (access.response) return access.response;
  return NextResponse.json(await getAnalytics());
}

export const GET = withApiObservability("GET", "/api/analytics", getAnalyticsRoute);
