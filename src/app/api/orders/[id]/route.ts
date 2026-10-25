import { NextResponse } from "next/server";
import { editOrderSchema } from "@application/dtos/order.dto";
import {
  editOrder,
  getOrderDetails,
  InsufficientEditStockError,
  OrderNotEditableError,
  ProductUnavailableError,
} from "@application/use-cases/edit-order";
import { authorize } from "@lib/authorize";
import { z } from "zod";
import { withApiObservability } from "@lib/api-observability";

export const dynamic = "force-dynamic";

async function getOrderRoute(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await authorize(request, "orders:read");
  if (access.response) return access.response;
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "Invalid order id" }, { status: 400 });
  const result = await getOrderDetails(id);
  return result ? NextResponse.json(result) : NextResponse.json({ error: "Order not found" }, { status: 404 });
}

async function editOrderRoute(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await authorize(request, "orders:write");
  if (access.response) return access.response;
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "Invalid order id" }, { status: 400 });
  const parsed = editOrderSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid order payload" }, { status: 400 });
  try {
    const order = await editOrder(id, parsed.data, access.session.email);
    return order ? NextResponse.json(order) : NextResponse.json({ error: "Order not found" }, { status: 404 });
  } catch (error) {
    if (error instanceof OrderNotEditableError) return NextResponse.json({ error: error.message }, { status: 409 });
    if (error instanceof ProductUnavailableError) return NextResponse.json({ error: error.message }, { status: 400 });
    if (error instanceof InsufficientEditStockError) return NextResponse.json({ error: error.message }, { status: 409 });
    throw error;
  }
}

export const GET = withApiObservability("GET", "/api/orders/[id]", getOrderRoute);
export const PUT = withApiObservability("PUT", "/api/orders/[id]", editOrderRoute);
