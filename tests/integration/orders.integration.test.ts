import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { getAnalytics } from "@application/use-cases/get-analytics";
import { getOrders } from "@application/use-cases/get-orders";
import { updateOrderStatus } from "@application/use-cases/update-order-status";
import { createOrder } from "@application/use-cases/create-order";
import { closeDb, getDb } from "@infrastructure/db/client";
import { orders, products, orderItems } from "@infrastructure/db/schema";

const integrationOrder = {
  orderNumber: `TEST-${Date.now()}`,
  customerName: "Integration Test",
  status: "PENDING" as const,
  total: "100.00",
  cost: "60.00",
};

describe("orders and analytics integration", () => {
  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL is required for integration tests");
    }
    await getDb().insert(orders).values(integrationOrder);
  });

  afterAll(async () => {
    await getDb().delete(orders).where(eq(orders.orderNumber, integrationOrder.orderNumber));
    await closeDb();
  });

  it("reads paginated orders from PostgreSQL", async () => {
    const result = await getOrders(1, 10);
    expect(result.some((order) => order.orderNumber === integrationOrder.orderNumber)).toBe(true);
  });

  it("persists a status update and exposes it in analytics", async () => {
    const [created] = await getDb().select().from(orders).where(eq(orders.orderNumber, integrationOrder.orderNumber));
    const updated = await updateOrderStatus(created.id, "PROCESSING");
    expect(updated?.status).toBe("PROCESSING");

    const analytics = await getAnalytics();
    expect(analytics.ordersByStatus.PROCESSING).toBeGreaterThanOrEqual(1);
  });

  it("creates an order and its items atomically from catalog prices", async () => {
    const selectedProducts = await getDb().select().from(products).limit(2);
    const [product, secondProduct] = selectedProducts;
    const created = await createOrder({
      customerName: "Atomic Integration",
      items: [
        { productId: product.id, quantity: 2 },
        { productId: secondProduct.id, quantity: 1 },
      ],
    });
    const items = await getDb().select().from(orderItems).where(eq(orderItems.orderId, created.id));
    const [updatedProduct] = await getDb().select().from(products).where(eq(products.id, product.id));

    expect(created.status).toBe("PENDING");
    expect(created.total).toBe((Number(product.price) * 2 + Number(secondProduct.price)).toFixed(2));
    expect(items).toHaveLength(2);
    expect(updatedProduct.stock).toBe(product.stock - 2);
    await getDb().delete(orders).where(eq(orders.id, created.id));
  });

  it("rolls back stock when inventory is insufficient", async () => {
    const [product] = await getDb().select().from(products).limit(1);
    const originalStock = product.stock;

    await expect(createOrder({
      customerName: "Insufficient Stock",
      items: [{ productId: product.id, quantity: originalStock + 1 }],
    })).rejects.toThrow("Insufficient stock");

    const [unchangedProduct] = await getDb().select().from(products).where(eq(products.id, product.id));
    expect(unchangedProduct.stock).toBe(originalStock);
  });
});
