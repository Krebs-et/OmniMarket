import { desc, eq } from "drizzle-orm";
import { getDb } from "@infrastructure/db/client";
import { orderStatusHistory } from "@infrastructure/db/schema";

export async function getOrderStatusHistory(orderId: string) {
  return getDb()
    .select()
    .from(orderStatusHistory)
    .where(eq(orderStatusHistory.orderId, orderId))
    .orderBy(desc(orderStatusHistory.changedAt));
}
