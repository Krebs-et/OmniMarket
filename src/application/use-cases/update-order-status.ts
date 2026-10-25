import { and, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@infrastructure/db/client";
import { orderItems, orders, orderStatusHistory, products } from "@infrastructure/db/schema";
import type { OrderStatus } from "@domain/value-objects/order-status";

export async function updateOrderStatus(id: string, status: OrderStatus, actorEmail: string) {
  return getDb().transaction(async (tx) => {
    const [currentOrder] = await tx.select().from(orders).where(eq(orders.id, id)).for("update");
    if (!currentOrder) return null;

    if (currentOrder.status === status) return currentOrder;

    if (status === "CANCELLED") {
      if (currentOrder.status === "SHIPPED" || currentOrder.status === "DELIVERED") {
        throw new InvalidOrderTransitionError("Orders shipped or delivered cannot be cancelled");
      }

      if (currentOrder.status !== "CANCELLED") {
        const items = await tx.select().from(orderItems).where(eq(orderItems.orderId, id));
        for (const item of items) {
          await tx.update(products)
            .set({
              stock: sql`${products.stock} + ${item.quantity}`,
              updatedAt: new Date(),
            })
            .where(eq(products.id, item.productId));
        }
      }
    } else if (currentOrder.status === "CANCELLED") {
      throw new InvalidOrderTransitionError("Cancelled orders cannot be reopened");
    }

    const [updatedOrder] = await tx
      .update(orders)
      .set({ status, updatedAt: new Date() })
      .where(and(eq(orders.id, id), inArray(orders.status, [currentOrder.status])))
      .returning();

    if (updatedOrder) {
      await tx.insert(orderStatusHistory).values({
        orderId: id,
        previousStatus: currentOrder.status,
        newStatus: status,
        actorEmail,
      });
    }

    return updatedOrder ?? null;
  });
}

export class InvalidOrderTransitionError extends Error {}
