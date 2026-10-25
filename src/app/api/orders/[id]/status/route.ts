import { NextResponse } from "next/server";
import { updateOrderStatusSchema } from "@application/dtos/order.dto";
import { InvalidOrderTransitionError, updateOrderStatus } from "@application/use-cases/update-order-status";
import { authorize } from "@lib/authorize";
import { withApiObservability } from "@lib/api-observability";

export const dynamic = "force-dynamic";

async function updateOrderStatusRoute(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await authorize(request, "orders:write");
  if (access.response) return access.response;
  const session = access.session;
  const { id } = await params;
  const parsed = updateOrderStatusSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid order status" }, { status: 400 });
  }

  let order;
  try {
    order = await updateOrderStatus(id, parsed.data.status, session.email);
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

export const PATCH = withApiObservability("PATCH", "/api/orders/[id]/status", updateOrderStatusRoute);
