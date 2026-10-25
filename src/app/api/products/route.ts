import { NextResponse } from "next/server";
import { productSearchSchema } from "@application/dtos/order.dto";
import { getProducts } from "@application/use-cases/get-products";
import { getSession } from "@lib/auth";
import { recordAuthenticationFailure } from "@lib/security";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!(await getSession())) {
    await recordAuthenticationFailure(request);
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const parsed = productSearchSchema.safeParse({ q: searchParams.get("q") || undefined, limit: searchParams.get("limit") || undefined });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query parameters" }, { status: 400 });
  }

  return NextResponse.json(await getProducts(parsed.data));
}
