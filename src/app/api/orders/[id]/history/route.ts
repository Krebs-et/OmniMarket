import { NextResponse } from "next/server";
import { getOrderStatusHistory } from "@application/use-cases/get-order-status-history";
import { authorize } from "@lib/authorize";
import { withApiObservability } from "@lib/api-observability";

export const dynamic = "force-dynamic";

async function getOrderHistoryRoute(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await authorize(request, "orders:read");
  if (access.response) return access.response;

  const { id } = await params;
  return NextResponse.json(await getOrderStatusHistory(id));
}

export const GET = withApiObservability("GET", "/api/orders/[id]/history", getOrderHistoryRoute);
