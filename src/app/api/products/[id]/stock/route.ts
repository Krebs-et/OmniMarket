import { NextResponse } from "next/server";
import { z } from "zod";
import { adjustStockSchema } from "@application/dtos/order.dto";
import { InsufficientAdjustmentError, adjustStock } from "@application/use-cases/manage-products";
import { authorize } from "@lib/authorize";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const access = await authorize(request, "catalog:write");
  if ("response" in access) return access.response;
  if (!z.string().uuid().safeParse(params.id).success) return NextResponse.json({ error: "Invalid product id" }, { status: 400 });

  const parsed = adjustStockSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid stock adjustment" }, { status: 400 });

  try {
    const product = await adjustStock(params.id, parsed.data.delta, parsed.data.note, access.session.email);
    return product ? NextResponse.json(product) : NextResponse.json({ error: "Product not found" }, { status: 404 });
  } catch (error) {
    if (error instanceof InsufficientAdjustmentError) return NextResponse.json({ error: "Adjustment would leave negative stock" }, { status: 409 });
    throw error;
  }
}
