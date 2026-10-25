import { inArray, sql } from "drizzle-orm";
import { getDb } from "@infrastructure/db/client";
import { orderItems, orders, orderStatusHistory, products, stockMovements } from "@infrastructure/db/schema";
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
      const lines = await tx
        .select({ orderId: orderItems.orderId, productId: orderItems.productId, quantity: sql<number>`sum(${orderItems.quantity})::int` })
        .from(orderItems)
        .where(inArray(orderItems.orderId, changingIds))
        .groupBy(orderItems.orderId, orderItems.productId);
      const totals = new Map<string, number>();
      for (const line of lines) totals.set(line.productId, (totals.get(line.productId) ?? 0) + line.quantity);
      if (totals.size > 0) {
        const values = sql.join([...totals].map(([productId, quantity]) => sql`(${productId}::uuid, ${quantity}::int)`), sql`, `);
        const finals = await tx.execute<{ id: string; stock: number }>(sql`update ${products} set stock = ${products.stock} + v.qty, updated_at = now() from (values ${values}) as v(id, qty) where ${products.id} = v.id returning ${products.id} as id, ${products.stock} as stock`);
        // Walk lines backwards from each product's final stock to give every movement its own stockAfter.
        const running = new Map<string, number>(finals.map((row) => [row.id, Number(row.stock)]));
        const movements = [...lines].reverse().map((line) => {
          const stockAfter = running.get(line.productId) ?? 0;
          running.set(line.productId, stockAfter - line.quantity);
          return { productId: line.productId, orderId: line.orderId, delta: line.quantity, stockAfter, reason: "cancellation" as const, actorEmail };
        });
        await tx.insert(stockMovements).values(movements);
      }
    }

    await tx.update(orders).set({ status, updatedAt: new Date() }).where(inArray(orders.id, changingIds));
    await tx.insert(orderStatusHistory).values(changing.map((order) => ({ orderId: order.id, previousStatus: order.status, newStatus: status, actorEmail })));
    return { updated: [...updated, ...changingIds], failed };
  });
}
