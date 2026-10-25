import { NextResponse } from "next/server";
import { createOrderSchema, listOrdersQuerySchema } from "@application/dtos/order.dto";
import { createOrder, InsufficientStockError, ProductNotFoundError } from "@application/use-cases/create-order";
import { getOrders } from "@application/use-cases/get-orders";
import { authorize } from "@lib/authorize";
import { withApiObservability } from "@lib/api-observability";

export const dynamic = "force-dynamic";

async function getOrdersRoute(request: Request) {
  const access = await authorize(request, "orders:read");
  if (access.response) return access.response;
  const { searchParams } = new URL(request.url);
  const parsed = listOrdersQuerySchema.safeParse(Object.fromEntries(
    ["page", "limit", "status", "q", "sort", "dir"].map((key) => [key, searchParams.get(key) || undefined]),
  ));

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query parameters" }, { status: 400 });
  }

  return NextResponse.json(await getOrders(parsed.data));
}

async function createOrderRoute(request: Request) {
  const access = await authorize(request, "orders:write");
  if (access.response) return access.response;

  const parsed = createOrderSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid order payload" }, { status: 400 });
  }

  try {
    return NextResponse.json(await createOrder(parsed.data, access.session.email), { status: 201 });
  } catch (error) {
    if (error instanceof ProductNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof InsufficientStockError) {
      return NextResponse.json({ error: "Insufficient stock for one or more products" }, { status: 409 });
    }
    throw error;
  }
}

export const GET = withApiObservability("GET", "/api/orders", getOrdersRoute);
export const POST = withApiObservability("POST", "/api/orders", createOrderRoute);
