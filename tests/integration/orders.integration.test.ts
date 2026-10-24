import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { getAnalytics } from "@application/use-cases/get-analytics";
import { getOrders } from "@application/use-cases/get-orders";
import { updateOrderStatus } from "@application/use-cases/update-order-status";
import { closeDb, getDb } from "@infrastructure/db/client";
import { orders } from "@infrastructure/db/schema";

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
});
