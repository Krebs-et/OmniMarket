import { NextResponse } from "next/server";
import { z } from "zod";
import { updateProductSchema } from "@application/dtos/order.dto";
import { updateProduct } from "@application/use-cases/manage-products";
import { authorize } from "@lib/authorize";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await authorize(request, "catalog:write");
  if ("response" in access) return access.response;
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "Invalid product id" }, { status: 400 });

  const parsed = updateProductSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid product changes" }, { status: 400 });

  const product = await updateProduct(id, parsed.data);
  return product ? NextResponse.json(product) : NextResponse.json({ error: "Product not found" }, { status: 404 });
}
