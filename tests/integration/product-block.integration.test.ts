import "dotenv/config";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { editOrder, getOrderDetails, InsufficientEditStockError, OrderNotEditableError } from "@application/use-cases/edit-order";
import { createOrder } from "@application/use-cases/create-order";
import { listProducts } from "@application/use-cases/get-products";
import { ProtectedUserRoleError, updateUserRole } from "@application/use-cases/manage-users";
import { closeDb, getDb } from "@infrastructure/db/client";
import { authUsers, orderItems, orders, products, stockMovements } from "@infrastructure/db/schema";

const tag = `PB${Date.now()}`;
const actor = "admin-product-block@example.com";
const emails = [`${tag.toLowerCase()}-a@example.com`, `${tag.toLowerCase()}-b@example.com`];
const configuredAdminEmail = emails[1];

describe("sprint 4 product workflows", () => {
  beforeAll(async () => {
    if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for integration tests");
    await getDb().insert(products).values([
      { sku: `${tag}-A`, name: `${tag} Original`, price: "10.00", cost: "4.00", stock: 10, lowStockThreshold: 5 },
      { sku: `${tag}-B`, name: `${tag} Added`, price: "7.00", cost: "2.00", stock: 10, lowStockThreshold: 3 },
    ]);
    await getDb().insert(authUsers).values([
      { id: `${tag}-user`, email: emails[0], role: "viewer" },
      { id: `${tag}-configured-admin`, email: configuredAdminEmail, role: "viewer" },
    ]);
  });

  beforeEach(async () => {
    await getDb().update(products).set({ stock: 10 }).where(eq(products.sku, `${tag}-A`));
    await getDb().update(products).set({ stock: 10 }).where(eq(products.sku, `${tag}-B`));
  });

  afterAll(async () => {
    await getDb().delete(authUsers).where(eq(authUsers.id, `${tag}-user`));
    await getDb().delete(authUsers).where(eq(authUsers.id, `${tag}-configured-admin`));
    await getDb().delete(orders).where(eq(orders.customerName, `${tag} Buyer`));
    await getDb().delete(products).where(eq(products.sku, `${tag}-A`));
    await getDb().delete(products).where(eq(products.sku, `${tag}-B`));
    await closeDb();
  });

  it("adjusts stock transactionally and preserves existing order price snapshots", async () => {
    const [original] = await getDb().select().from(products).where(eq(products.sku, `${tag}-A`));
    const second = (await getDb().select().from(products).where(eq(products.sku, `${tag}-B`)))[0];
    const order = await createOrder({ customerName: `${tag} Buyer`, items: [{ productId: original.id, quantity: 2 }] }, actor);
    await getDb().update(products).set({ price: "99.00", cost: "88.00" }).where(eq(products.id, original.id));

    const updated = await editOrder(order.id, {
      customerName: `${tag} Buyer`,
      items: [{ productId: original.id, quantity: 3 }, { productId: second.id, quantity: 1 }],
    }, actor);
    const detail = await getOrderDetails(order.id);
    const [freshOriginal] = await getDb().select().from(products).where(eq(products.id, original.id));
    const [freshAdded] = await getDb().select().from(products).where(eq(products.id, second.id));
    const movements = await getDb().select().from(stockMovements).where(eq(stockMovements.orderId, order.id));

    expect(updated?.total).toBe("37.00");
    expect(updated?.cost).toBe("14.00");
    expect(detail?.items).toHaveLength(2);
    expect(detail?.items.find((item) => item.productId === original.id)?.unitPrice).toBe("10.00");
    expect(freshOriginal.stock).toBe(7);
    expect(freshAdded.stock).toBe(9);
    expect(movements.filter((movement) => movement.reason === "order_edit").map((movement) => movement.delta).sort()).toEqual([-1, -1]);

    await editOrder(order.id, { customerName: `${tag} Buyer`, items: [{ productId: original.id, quantity: 1 }] }, actor);
    const [restoredOriginal] = await getDb().select().from(products).where(eq(products.id, original.id));
    const [restoredAdded] = await getDb().select().from(products).where(eq(products.id, second.id));
    expect(restoredOriginal.stock).toBe(9);
    expect(restoredAdded.stock).toBe(10);
  });

  it("rolls back every change when an edited quantity exceeds available stock", async () => {
    const [product] = await getDb().select().from(products).where(eq(products.sku, `${tag}-A`));
    const order = await createOrder({ customerName: `${tag} Buyer`, items: [{ productId: product.id, quantity: 1 }] }, actor);
    await getDb().update(products).set({ stock: 0 }).where(eq(products.id, product.id));
    const itemCount = await getDb().select().from(orderItems).where(eq(orderItems.orderId, order.id));
    await expect(editOrder(order.id, {
      customerName: `${tag} Buyer`,
      items: [{ productId: product.id, quantity: 2 }],
    }, actor)).rejects.toBeInstanceOf(InsufficientEditStockError);
    const detail = await getOrderDetails(order.id);
    const [unchangedProduct] = await getDb().select().from(products).where(eq(products.id, product.id));
    expect(detail?.items).toHaveLength(itemCount.length);
    expect(detail?.order.total).toBe(order.total);
    expect(unchangedProduct.stock).toBe(0);
  });

  it("rejects edits once a pending order has advanced", async () => {
    const [product] = await getDb().select().from(products).where(eq(products.sku, `${tag}-A`));
    const order = await createOrder({ customerName: `${tag} Buyer`, items: [{ productId: product.id, quantity: 1 }] }, actor);
    await getDb().update(orders).set({ status: "CONFIRMED" }).where(eq(orders.id, order.id));
    await expect(editOrder(order.id, {
      customerName: `${tag} Buyer`,
      items: [{ productId: product.id, quantity: 1 }],
    }, actor)).rejects.toBeInstanceOf(OrderNotEditableError);
  });

  it("filters products by their configured low-stock threshold", async () => {
    await getDb().update(products).set({ stock: 5 }).where(eq(products.sku, `${tag}-A`));
    await getDb().update(products).set({ stock: 3, lowStockThreshold: 3 }).where(eq(products.sku, `${tag}-B`));
    const result = await listProducts({
      q: tag,
      limit: 10,
      page: 1,
      includeInactive: false,
      lowStockOnly: true,
    });
    expect(result.items.map((product) => product.sku).sort()).toEqual([`${tag}-A`, `${tag}-B`].sort());
    expect(result.lowStockTotal).toBeGreaterThanOrEqual(2);
  });

  it("lets admins change another user's role but prevents self-demotion", async () => {
    const [user] = await getDb().select().from(authUsers).where(eq(authUsers.id, `${tag}-user`));
    const updated = await updateUserRole(user.id, "operator", actor);
    expect(updated.role).toBe("operator");
    await expect(updateUserRole(user.id, "viewer", emails[0])).rejects.toBeInstanceOf(ProtectedUserRoleError);
  });

  it("preserves configured administrators even when their database role is not admin", async () => {
    const previous = process.env.ADMIN_EMAILS;
    process.env.ADMIN_EMAILS = configuredAdminEmail;
    try {
      const [user] = await getDb().select().from(authUsers).where(eq(authUsers.id, `${tag}-user`));
      await updateUserRole(user.id, "admin", actor);
      await expect(updateUserRole(user.id, "operator", actor)).resolves.toMatchObject({ role: "operator" });
    } finally {
      if (previous === undefined) delete process.env.ADMIN_EMAILS; else process.env.ADMIN_EMAILS = previous;
    }
  });
});
