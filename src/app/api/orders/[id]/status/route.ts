import { NextResponse } from "next/server";
import { updateOrderStatusSchema } from "@application/dtos/order.dto";
import { updateOrderStatus } from "@application/use-cases/update-order-status";
import { getSession } from "@lib/auth";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  if (!(await getSession())) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
  const parsed = updateOrderStatusSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid order status" }, { status: 400 });
  }

  const order = await updateOrderStatus(params.id, parsed.data.status);
  if (!order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  return NextResponse.json(order);
}
