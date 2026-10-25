import { NextResponse } from "next/server";
import { desc } from "drizzle-orm";
import { getDb } from "@infrastructure/db/client";
import { orders } from "@infrastructure/db/schema";
import { authorize } from "@lib/authorize";
import { toCsv } from "@lib/csv";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const access = await authorize(request, "orders:read");
  if ("response" in access) return access.response;
  const rows = await getDb().select().from(orders).orderBy(desc(orders.createdAt));
  const csv = toCsv([
    ["pedido", "cliente", "estado", "total", "costo", "creado", "actualizado"],
    ...rows.map((order) => [
      order.orderNumber, order.customerName, order.status, order.total, order.cost,
      order.createdAt.toISOString(), order.updatedAt.toISOString(),
    ]),
  ]);
  return new NextResponse(`\uFEFF${csv}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="pedidos.csv"',
      "Cache-Control": "no-store",
    },
  });
}
