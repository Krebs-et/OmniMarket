import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { getDb } from "@infrastructure/db/client";
import { orderItems, orders, products, stockMovements } from "@infrastructure/db/schema";
import type { CreateOrderInput } from "@application/dtos/order.dto";

function createOrderNumber() {
  return `OM-${Date.now()}-${Math.floor(Math.random() * 1000).toString().padStart(3, "0")}`;
}

export class ProductNotFoundError extends Error {}
export class InsufficientStockError extends Error {}

export async function createOrder(input: CreateOrderInput, actorEmail = "system") {
  return getDb().transaction(async (tx) => {
    const productIds = [...new Set(input.items.map((item) => item.productId))];
    const selectedProducts = await tx.select().from(products).where(inArray(products.id, productIds));
    const productById = new Map(selectedProducts.map((product) => [product.id, product]));

    if (selectedProducts.length !== productIds.length || selectedProducts.some((product) => !product.active)) {
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

    // Una sola sentencia condicionada por stock evita N viajes a la base de datos.
    const values = sql.join(lineItems.map((item) => sql`(${item.productId}::uuid, ${item.quantity}::int)`), sql`, `);
    const updated = await tx.execute<{ id: string; stock: number }>(sql`
      update products p set stock = p.stock - v.qty, updated_at = now()
      from (values ${values}) as v(id, qty)
      where p.id = v.id and p.stock >= v.qty
      returning p.id, p.stock`);
    if (updated.length !== lineItems.length) {
      const updatedIds = new Set(updated.map((row) => row.id));
      const missing = lineItems.find((item) => !updatedIds.has(item.productId));
      throw new InsufficientStockError(`Insufficient stock for product ${missing?.productId}`);
    }
    const stockAfterById = new Map(updated.map((row) => [row.id, row.stock]));
    const movements = lineItems.map((item) => ({
      productId: item.productId,
      delta: -item.quantity,
      stockAfter: stockAfterById.get(item.productId) as number,
    }));

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
    await tx.insert(stockMovements).values(movements.map((movement) => ({
      ...movement,
      orderId: order.id,
      reason: "order" as const,
      actorEmail,
    })));
    return order;
  });
}
