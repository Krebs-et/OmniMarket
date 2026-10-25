import { and, asc, count, desc, eq, ilike, or, type SQL } from "drizzle-orm";
import { getDb } from "@infrastructure/db/client";
import { orders } from "@infrastructure/db/schema";
import type { OrderStatus } from "@domain/value-objects/order-status";

export type OrderListQuery = {
  page: number;
  limit: number;
  status?: OrderStatus;
  q?: string;
  sort?: "created" | "total" | "customer";
  dir?: "asc" | "desc";
};

const sortColumns = { created: orders.createdAt, total: orders.total, customer: orders.customerName } as const;

export async function getOrders({ page, limit, status, q, sort = "created", dir = "desc" }: OrderListQuery) {
  const filters: SQL[] = [];
  if (status) filters.push(eq(orders.status, status));
  const term = q?.trim();
  if (term) {
    const pattern = `%${term.replace(/[\\%_]/g, "\\$&")}%`;
    const match = or(ilike(orders.customerName, pattern), ilike(orders.orderNumber, pattern));
    if (match) filters.push(match);
  }
  const where = filters.length > 0 ? and(...filters) : undefined;
  const direction = dir === "asc" ? asc : desc;
  const db = getDb();

  const [items, [{ total }]] = await Promise.all([
    db.select().from(orders).where(where).orderBy(direction(sortColumns[sort]), desc(orders.id)).limit(limit).offset((page - 1) * limit),
    db.select({ total: count() }).from(orders).where(where),
  ]);
  return { items, total, page, limit };
}
