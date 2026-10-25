import { NextResponse } from "next/server";
import { getOrderStatusHistory } from "@application/use-cases/get-order-status-history";
import { getSession } from "@lib/auth";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  if (!(await getSession())) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  return NextResponse.json(await getOrderStatusHistory(params.id));
}
