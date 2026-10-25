import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { closeDb, getDb } from "@infrastructure/db/client";
import { orderItems, orders, products } from "@infrastructure/db/schema";
import { getProducts } from "@application/use-cases/get-products";

const integrationProduct = {
  sku: `TEST-SKU-${Date.now()}`,
  name: "Integration Product",
  price: "19.99",
  cost: "8.00",
  stock: 10,
};

describe("catalog integration", () => {
  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL is required for integration tests");
    }
    await getDb().insert(products).values(integrationProduct);
  });

  afterAll(async () => {
    await getDb().delete(products).where(eq(products.sku, integrationProduct.sku));
    await closeDb();
  });

  it("reads products ordered by name", async () => {
    const result = await getProducts();
    expect(result.some((product) => product.sku === integrationProduct.sku)).toBe(true);
  });

  it("enforces order item relationships", async () => {
    const [order] = await getDb().insert(orders).values({
      orderNumber: `TEST-CATALOG-${Date.now()}`,
      customerName: "Catalog Integration",
      status: "PENDING",
      total: "19.99",
      cost: "8.00",
    }).returning();
    const [product] = await getDb().select().from(products)
      .where(eq(products.sku, integrationProduct.sku));

    const [item] = await getDb().insert(orderItems).values({
      orderId: order.id,
      productId: product.id,
      quantity: 1,
      unitPrice: product.price,
      unitCost: product.cost,
    }).returning();

    expect(item.orderId).toBe(order.id);
    expect(item.productId).toBe(product.id);
    await getDb().delete(orders).where(eq(orders.id, order.id));
  });
});
