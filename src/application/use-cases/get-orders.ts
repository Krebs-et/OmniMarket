import { desc } from "drizzle-orm";
import { getDb } from "@infrastructure/db/client";
import { orders } from "@infrastructure/db/schema";

export async function getOrders(page: number, limit: number) {
  const offset = (page - 1) * limit;
  return getDb().select().from(orders).orderBy(desc(orders.createdAt)).limit(limit).offset(offset);
}
