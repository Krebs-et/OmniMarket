import { NextResponse } from "next/server";
import { getOrderStatusHistory } from "@application/use-cases/get-order-status-history";
import { authorize } from "@lib/authorize";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await authorize(request, "orders:read");
  if ("response" in access) return access.response;

  const { id } = await params;
  return NextResponse.json(await getOrderStatusHistory(id));
}
