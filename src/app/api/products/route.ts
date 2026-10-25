import { NextResponse } from "next/server";
import { createProductSchema, productSearchSchema } from "@application/dtos/order.dto";
import { listProducts } from "@application/use-cases/get-products";
import { DuplicateSkuError, createProduct } from "@application/use-cases/manage-products";
import { authorize } from "@lib/authorize";
import { can } from "@domain/value-objects/role";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const access = await authorize(request, "catalog:read");
  if ("response" in access) return access.response;

  const { searchParams } = new URL(request.url);
  const parsed = productSearchSchema.safeParse({
    q: searchParams.get("q") || undefined,
    limit: searchParams.get("limit") || undefined,
    page: searchParams.get("page") || undefined,
    includeInactive: searchParams.get("includeInactive") || undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query parameters" }, { status: 400 });
  }

  const includeInactive = parsed.data.includeInactive && can(access.session.role, "catalog:write");
  return NextResponse.json(await listProducts({ ...parsed.data, includeInactive }));
}

export async function POST(request: Request) {
  const access = await authorize(request, "catalog:write");
  if ("response" in access) return access.response;

  const parsed = createProductSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid product", issues: parsed.error.flatten() }, { status: 400 });
  }
  try {
    return NextResponse.json(await createProduct(parsed.data, access.session.email), { status: 201 });
  } catch (error) {
    if (error instanceof DuplicateSkuError) return NextResponse.json({ error: "SKU already exists" }, { status: 409 });
    throw error;
  }
}
