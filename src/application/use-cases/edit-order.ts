import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { getDb } from "@infrastructure/db/client";
import { orderItems, orders, products, stockMovements } from "@infrastructure/db/schema";
import type { CreateOrderInput } from "@application/dtos/order.dto";

export class OrderNotEditableError extends Error {}
export class ProductUnavailableError extends Error {}
export class InsufficientEditStockError extends Error {}

export async function getOrderDetails(id: string) {
  const db = getDb();
  const [order] = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
  if (!order) return null;
  const items = await db.select({
    productId: orderItems.productId,
    quantity: orderItems.quantity,
    unitPrice: orderItems.unitPrice,
    unitCost: orderItems.unitCost,
    name: products.name,
    sku: products.sku,
    stock: products.stock,
  }).from(orderItems)
    .innerJoin(products, eq(products.id, orderItems.productId))
    .where(eq(orderItems.orderId, id));
  return { order, items };
}

export async function editOrder(id: string, input: CreateOrderInput, actorEmail: string) {
  return getDb().transaction(async (tx) => {
    const [order] = await tx.select().from(orders).where(eq(orders.id, id)).for("update");
    if (!order) return null;
    if (order.status !== "PENDING") throw new OrderNotEditableError("Only pending orders can be edited");

    const previousItems = await tx.select().from(orderItems).where(eq(orderItems.orderId, id));
    const previousByProduct = new Map(previousItems.map((item) => [item.productId, item]));
    const productIds = [...new Set([...previousItems.map((item) => item.productId), ...input.items.map((item) => item.productId)])].sort();
    const selectedProducts = await tx.select().from(products).where(inArray(products.id, productIds)).orderBy(products.id).for("update");
    const productsById = new Map(selectedProducts.map((product) => [product.id, product]));

    const lineItems = input.items.map((item) => {
      const product = productsById.get(item.productId);
      if (!product) throw new ProductUnavailableError("One or more products were not found");
      const previous = previousByProduct.get(item.productId);
      if (!previous && !product.active) throw new ProductUnavailableError("New order lines must use active products");
      return {
        productId: item.productId,
        quantity: item.quantity,
        unitPrice: previous?.unitPrice ?? product.price,
        unitCost: previous?.unitCost ?? product.cost,
      };
    });

    const nextQuantities = new Map(lineItems.map((item) => [item.productId, item.quantity]));
    for (const productId of productIds) {
      const oldQuantity = previousByProduct.get(productId)?.quantity ?? 0;
      const newQuantity = nextQuantities.get(productId) ?? 0;
      const delta = oldQuantity - newQuantity;
      if (delta === 0) continue;
      const [updated] = await tx.update(products)
        .set({ stock: sql`${products.stock} + ${delta}`, updatedAt: new Date() })
        .where(and(eq(products.id, productId), gte(sql`${products.stock} + ${delta}`, 0)))
        .returning({ stock: products.stock });
      if (!updated) throw new InsufficientEditStockError(`Insufficient stock for product ${productId}`);
      await tx.insert(stockMovements).values({
        productId,
        orderId: id,
        delta,
        stockAfter: updated.stock,
        reason: "order_edit",
        note: "Ajuste por edición de pedido pendiente",
        actorEmail,
      });
    }

    const total = lineItems.reduce((sum, item) => sum + Number(item.unitPrice) * item.quantity, 0).toFixed(2);
    const cost = lineItems.reduce((sum, item) => sum + Number(item.unitCost) * item.quantity, 0).toFixed(2);
    const [updatedOrder] = await tx.update(orders)
      .set({ customerName: input.customerName, total, cost, updatedAt: new Date() })
      .where(eq(orders.id, id))
      .returning();
    await tx.delete(orderItems).where(eq(orderItems.orderId, id));
    await tx.insert(orderItems).values(lineItems.map((item) => ({ ...item, orderId: id })));
    return updatedOrder;
  });
}
