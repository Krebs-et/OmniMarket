import { NextResponse } from "next/server";
import { getOrderStatusHistory } from "@application/use-cases/get-order-status-history";
import { authorize } from "@lib/authorize";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const access = await authorize(request, "orders:read");
  if ("response" in access) return access.response;

  return NextResponse.json(await getOrderStatusHistory(params.id));
}
