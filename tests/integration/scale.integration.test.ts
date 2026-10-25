import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, like } from "drizzle-orm";
import { closeDb, getDb } from "@infrastructure/db/client";
import { orders, products } from "@infrastructure/db/schema";
import { createOrder } from "@application/use-cases/create-order";
import { getAnalytics } from "@application/use-cases/get-analytics";
import { getOrders } from "@application/use-cases/get-orders";
import { getProducts } from "@application/use-cases/get-products";
import { updateOrdersStatus } from "@application/use-cases/update-orders-status";

const tag = `SCALE${Date.now()}`;
const ORDER_COUNT = 250;
const PRODUCT_COUNT = 50;

describe("scale: many orders and many lines per order", () => {
  beforeAll(async () => {
    if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for integration tests");
    const db = getDb();
    await db.insert(orders).values(Array.from({ length: ORDER_COUNT }, (_, index) => ({
      orderNumber: `${tag}-${String(index).padStart(4, "0")}`,
      customerName: index % 2 === 0 ? `${tag} Alfa ${index}` : `${tag} Beta ${index}`,
      status: index % 5 === 0 ? ("DELIVERED" as const) : ("PENDING" as const),
      total: "10.00",
      cost: "4.00",
    })));
    await db.insert(products).values(Array.from({ length: PRODUCT_COUNT }, (_, index) => ({
      sku: `${tag}-P${index}`, name: `${tag} Producto ${index}`, price: "5.00", cost: "2.00", stock: 100,
    })));
  });

  afterAll(async () => {
    await getDb().delete(orders).where(like(orders.orderNumber, `${tag}%`));
    await getDb().delete(orders).where(like(orders.customerName, `${tag}%`));
    await getDb().delete(products).where(like(products.sku, `${tag}%`));
    await closeDb();
  });

  it("paginates, filters and counts without loading every row", async () => {
    const first = await getOrders({ page: 1, limit: 20, q: tag });
    expect(first.total).toBe(ORDER_COUNT);
    expect(first.items).toHaveLength(20);

    const last = await getOrders({ page: 13, limit: 20, q: tag });
    expect(last.items).toHaveLength(ORDER_COUNT - 12 * 20);

    const delivered = await getOrders({ page: 1, limit: 100, q: tag, status: "DELIVERED" });
    expect(delivered.total).toBe(ORDER_COUNT / 5);
    expect(delivered.items.every((order) => order.status === "DELIVERED")).toBe(true);

    const alfa = await getOrders({ page: 1, limit: 100, q: `${tag} Alfa`, sort: "customer", dir: "asc" });
    expect(alfa.total).toBe(ORDER_COUNT / 2);
  });

  it("treats LIKE wildcards in search as literal characters", async () => {
    const result = await getOrders({ page: 1, limit: 10, q: "%" });
    expect(result.items.every((order) => `${order.customerName}${order.orderNumber}`.includes("%"))).toBe(true);
  });

  it("aggregates analytics in SQL consistently", async () => {
    const analytics = await getAnalytics();
    const sum = Object.values(analytics.ordersByStatus).reduce((total, count) => total + (count ?? 0), 0);
    expect(sum).toBe(analytics.totalOrders);
    expect(analytics.totalOrders).toBeGreaterThanOrEqual(ORDER_COUNT);
    expect(analytics.totalSales).toBeGreaterThanOrEqual(ORDER_COUNT * 10);
  });

  it("searches the catalog and honours the limit", async () => {
    const found = await getProducts({ q: `${tag} Producto 1`, limit: 5 });
    expect(found.length).toBeLessThanOrEqual(5);
    expect(found.length).toBeGreaterThan(0);
  });

  it("creates an order with 50 lines atomically", async () => {
    const catalog = await getProducts({ q: tag, limit: 50 });
    expect(catalog).toHaveLength(PRODUCT_COUNT);
    const created = await createOrder({ customerName: `${tag} Mayorista`, items: catalog.map((product) => ({ productId: product.id, quantity: 2 })) });
    expect(Number(created.total)).toBe(PRODUCT_COUNT * 2 * 5);
    const [after] = await getDb().select().from(products).where(eq(products.id, catalog[0].id));
    expect(after.stock).toBe(98);
  }, 30000);

  it("applies bulk status changes and reports partial failures", async () => {
    const page = await getOrders({ page: 1, limit: 30, q: tag, status: "PENDING" });
    const ids = page.items.map((order) => order.id);
    const [shipped, ...rest] = ids;
    await updateOrdersStatus([shipped], "SHIPPED", "bulk@omnimarket.local");

    const cancel = await updateOrdersStatus([shipped, ...rest, "00000000-0000-4000-8000-000000000000"], "CANCELLED", "bulk@omnimarket.local");
    expect(cancel.updated).toHaveLength(rest.length);
    expect(cancel.failed.map((failure) => failure.reason).sort()).toEqual(["invalid_transition", "not_found"]);
  }, 60000);

  it("restores stock once when a bulk cancellation is repeated", async () => {
    const [product] = await getProducts({ q: `${tag} Producto 7`, limit: 1 });
    const created = await createOrder({ customerName: `${tag} Cancelable`, items: [{ productId: product.id, quantity: 3 }] });
    const stockOf = async () => (await getDb().select().from(products).where(eq(products.id, product.id)))[0].stock;
    expect(await stockOf()).toBe(product.stock - 3);

    await updateOrdersStatus([created.id], "CANCELLED", "bulk@omnimarket.local");
    await updateOrdersStatus([created.id], "CANCELLED", "bulk@omnimarket.local");
    expect(await stockOf()).toBe(product.stock);
  }, 30000);
});
