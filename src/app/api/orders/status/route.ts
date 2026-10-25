import { NextResponse } from "next/server";
import { bulkUpdateStatusSchema } from "@application/dtos/order.dto";
import { updateOrdersStatus } from "@application/use-cases/update-orders-status";
import { getSession } from "@lib/auth";
import { recordAuthenticationFailure } from "@lib/security";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request) {
  const session = await getSession();
  if (!session) {
    await recordAuthenticationFailure(request);
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
  const parsed = bulkUpdateStatusSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid bulk status payload" }, { status: 400 });
  }
  return NextResponse.json(await updateOrdersStatus(parsed.data.ids, parsed.data.status, session.email));
}
