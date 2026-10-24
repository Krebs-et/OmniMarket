import { eq } from "drizzle-orm";
import { getDb } from "@infrastructure/db/client";
import { orders } from "@infrastructure/db/schema";
import type { OrderStatus } from "@domain/value-objects/order-status";

export async function updateOrderStatus(id: string, status: OrderStatus) {
  const [updatedOrder] = await getDb()
    .update(orders)
    .set({ status, updatedAt: new Date() })
    .where(eq(orders.id, id))
    .returning();

  return updatedOrder ?? null;
}
