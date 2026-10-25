import { inArray, sql } from "drizzle-orm";
import { getDb } from "@infrastructure/db/client";
import { orderItems, orders, orderStatusHistory, products } from "@infrastructure/db/schema";
import type { OrderStatus } from "@domain/value-objects/order-status";

export type BulkStatusFailure = { id: string; reason: "not_found" | "invalid_transition"; message: string };

// Set-based and transactional: a constant number of queries regardless of batch size.
// Orders that cannot transition are reported and skipped without blocking the rest.
export async function updateOrdersStatus(ids: string[], status: OrderStatus, actorEmail: string) {
  return getDb().transaction(async (tx) => {
    const current = await tx.select().from(orders).where(inArray(orders.id, ids)).for("update");
    const byId = new Map(current.map((order) => [order.id, order]));
    const failed: BulkStatusFailure[] = [];
    const changing: typeof current = [];
    const updated: string[] = [];

    for (const id of ids) {
      const order = byId.get(id);
      if (!order) failed.push({ id, reason: "not_found", message: "Order not found" });
      else if (order.status === status) updated.push(id);
      else if (status === "CANCELLED" && (order.status === "SHIPPED" || order.status === "DELIVERED")) failed.push({ id, reason: "invalid_transition", message: "Orders shipped or delivered cannot be cancelled" });
      else if (status !== "CANCELLED" && order.status === "CANCELLED") failed.push({ id, reason: "invalid_transition", message: "Cancelled orders cannot be reopened" });
      else changing.push(order);
    }
    if (changing.length === 0) return { updated, failed };
    const changingIds = changing.map((order) => order.id);

    if (status === "CANCELLED") {
      const restock = await tx
        .select({ productId: orderItems.productId, quantity: sql<number>`sum(${orderItems.quantity})::int` })
        .from(orderItems)
        .where(inArray(orderItems.orderId, changingIds))
        .groupBy(orderItems.productId);
      if (restock.length > 0) {
        const values = sql.join(restock.map((row) => sql`(${row.productId}::uuid, ${row.quantity}::int)`), sql`, `);
        await tx.execute(sql`update ${products} set stock = ${products.stock} + v.qty, updated_at = now() from (values ${values}) as v(id, qty) where ${products.id} = v.id`);
      }
    }

    await tx.update(orders).set({ status, updatedAt: new Date() }).where(inArray(orders.id, changingIds));
    await tx.insert(orderStatusHistory).values(changing.map((order) => ({ orderId: order.id, previousStatus: order.status, newStatus: status, actorEmail })));
    return { updated: [...updated, ...changingIds], failed };
  });
}
