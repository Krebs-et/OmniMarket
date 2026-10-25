import { NextResponse } from "next/server";
import { asc } from "drizzle-orm";
import { getDb } from "@infrastructure/db/client";
import { products } from "@infrastructure/db/schema";
import { authorize } from "@lib/authorize";
import { toCsv } from "@lib/csv";
import { withApiObservability } from "@lib/api-observability";

export const dynamic = "force-dynamic";

async function exportProductsRoute(request: Request) {
  const access = await authorize(request, "catalog:read");
  if (access.response) return access.response;
  const rows = await getDb().select().from(products).orderBy(asc(products.name));
  const csv = toCsv([
    ["sku", "producto", "precio", "costo", "stock", "umbral_bajo_stock", "activo"],
    ...rows.map((product) => [
      product.sku, product.name, product.price, product.cost, product.stock,
      product.lowStockThreshold, product.active ? "sí" : "no",
    ]),
  ]);
  return new NextResponse(`\uFEFF${csv}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="productos.csv"',
      "Cache-Control": "no-store",
    },
  });
}

export const GET = withApiObservability("GET", "/api/exports/products", exportProductsRoute);
