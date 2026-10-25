import { NextResponse } from "next/server";
import { updateOrderStatusSchema } from "@application/dtos/order.dto";
import { InvalidOrderTransitionError, updateOrderStatus } from "@application/use-cases/update-order-status";
import { getSession } from "@lib/auth";
import { recordAuthenticationFailure } from "@lib/security";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) {
    await recordAuthenticationFailure(request);
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
  const parsed = updateOrderStatusSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid order status" }, { status: 400 });
  }

  let order;
  try {
    order = await updateOrderStatus(params.id, parsed.data.status, session.email);
  } catch (error) {
    if (error instanceof InvalidOrderTransitionError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    throw error;
  }
  if (!order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  return NextResponse.json(order);
}
