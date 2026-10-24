import { NextResponse } from "next/server";
import { paginationSchema } from "@application/dtos/order.dto";
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
