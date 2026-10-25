import { NextResponse } from "next/server";
import { bulkUpdateStatusSchema } from "@application/dtos/order.dto";
import { updateOrdersStatus } from "@application/use-cases/update-orders-status";
import { authorize } from "@lib/authorize";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request) {
  const access = await authorize(request, "orders:write");
  if ("response" in access) return access.response;
  const session = access.session;
  const parsed = bulkUpdateStatusSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid bulk status payload" }, { status: 400 });
  }
  return NextResponse.json(await updateOrdersStatus(parsed.data.ids, parsed.data.status, session.email));
}
