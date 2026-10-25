import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { getDb } from "@infrastructure/db/client";
import { orderItems, orders, products } from "@infrastructure/db/schema";
import type { CreateOrderInput } from "@application/dtos/order.dto";

function createOrderNumber() {
  return `OM-${Date.now()}-${Math.floor(Math.random() * 1000).toString().padStart(3, "0")}`;
}

export class ProductNotFoundError extends Error {}
export class InsufficientStockError extends Error {}

export async function createOrder(input: CreateOrderInput) {
  return getDb().transaction(async (tx) => {
    const productIds = [...new Set(input.items.map((item) => item.productId))];
    const selectedProducts = await tx.select().from(products).where(inArray(products.id, productIds));
    const productById = new Map(selectedProducts.map((product) => [product.id, product]));

    if (selectedProducts.length !== productIds.length) {
      throw new ProductNotFoundError("One or more products were not found");
    }

    const lineItems = input.items.map((item) => {
      const product = productById.get(item.productId);
      if (!product) {
        throw new ProductNotFoundError("One or more products were not found");
      }

      return {
        productId: product.id,
        quantity: item.quantity,
        unitPrice: product.price,
        unitCost: product.cost,
      };
    });

    for (const item of lineItems) {
      const [updatedProduct] = await tx.update(products)
        .set({ stock: sql`${products.stock} - ${item.quantity}`, updatedAt: new Date() })
        .where(and(eq(products.id, item.productId), gte(products.stock, item.quantity)))
        .returning({ id: products.id });

      if (!updatedProduct) {
        throw new InsufficientStockError(`Insufficient stock for product ${item.productId}`);
      }
    }

    const total = lineItems.reduce((sum, item) => sum + Number(item.unitPrice) * item.quantity, 0).toFixed(2);
    const cost = lineItems.reduce((sum, item) => sum + Number(item.unitCost) * item.quantity, 0).toFixed(2);
    const [order] = await tx.insert(orders).values({
      orderNumber: createOrderNumber(),
      customerName: input.customerName,
      status: "PENDING",
      total,
      cost,
    }).returning();

    await tx.insert(orderItems).values(lineItems.map((item) => ({ ...item, orderId: order.id })));
    return order;
  });
}
