import { NextResponse } from "next/server";
import { createOrderSchema, paginationSchema } from "@application/dtos/order.dto";
import { createOrder, InsufficientStockError, ProductNotFoundError } from "@application/use-cases/create-order";
import { getOrders } from "@application/use-cases/get-orders";
import { getSession } from "@lib/auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!(await getSession())) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
  const { searchParams } = new URL(request.url);
  const parsed = paginationSchema.safeParse({
    page: searchParams.get("page") ?? undefined,
    limit: searchParams.get("limit") ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid pagination parameters" }, { status: 400 });
  }

  return NextResponse.json(await getOrders(parsed.data.page, parsed.data.limit));
}

export async function POST(request: Request) {
  if (!(await getSession())) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const parsed = createOrderSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid order payload" }, { status: 400 });
  }

  try {
    return NextResponse.json(await createOrder(parsed.data), { status: 201 });
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
