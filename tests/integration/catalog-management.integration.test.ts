import "dotenv/config";
import { afterAll, describe, expect, it } from "vitest";
import { desc, eq } from "drizzle-orm";
import { createOrder } from "@application/use-cases/create-order";
import { updateOrderStatus } from "@application/use-cases/update-order-status";
import { updateOrdersStatus } from "@application/use-cases/update-orders-status";
import { DuplicateSkuError, InsufficientAdjustmentError, adjustStock, createProduct, updateProduct } from "@application/use-cases/manage-products";
import { listProducts } from "@application/use-cases/get-products";
import { resolveRole } from "@application/use-cases/resolve-role";
import { closeDb, getDb } from "@infrastructure/db/client";
import { authUsers, products, stockMovements } from "@infrastructure/db/schema";

const tag = `CM${Date.now()}`;
const actor = "integration@omnimarket.local";

async function movementsFor(productId: string) {
  return getDb().select().from(stockMovements).where(eq(stockMovements.productId, productId)).orderBy(desc(stockMovements.createdAt));
}

describe("catalog management", () => {
  afterAll(async () => {
    await closeDb();
  });

  it("creates products with an initial movement and rejects duplicate SKUs", async () => {
    const created = await createProduct({ sku: `${tag}-A`, name: "Catalog A", price: "10.00", cost: "5.00", stock: 12 }, actor);
    expect(created.active).toBe(true);
    const movements = await movementsFor(created.id);
    expect(movements).toHaveLength(1);
    expect(movements[0]).toMatchObject({ delta: 12, stockAfter: 12, reason: "initial", actorEmail: actor });
    await expect(createProduct({ sku: `${tag}-a`, name: "Dup", price: "1.00", cost: "1.00", stock: 0 }, actor)).rejects.toBeInstanceOf(DuplicateSkuError);
  });

  it("adjusts stock with an audit trail and never goes negative", async () => {
    const product = await createProduct({ sku: `${tag}-B`, name: "Catalog B", price: "10.00", cost: "5.00", stock: 5 }, actor);
    const increased = await adjustStock(product.id, 3, "recuento", actor);
    expect(increased?.stock).toBe(8);
    await expect(adjustStock(product.id, -9, undefined, actor)).rejects.toBeInstanceOf(InsufficientAdjustmentError);
    const [fresh] = await getDb().select().from(products).where(eq(products.id, product.id));
    expect(fresh.stock).toBe(8);
    const movements = await movementsFor(product.id);
    expect(movements.filter((movement) => movement.reason === "adjustment")).toHaveLength(1);
    expect(await adjustStock("00000000-0000-4000-8000-000000000000", 1, undefined, actor)).toBeNull();
  });

  it("hides inactive products from the catalog and rejects them in new orders", async () => {
    const product = await createProduct({ sku: `${tag}-C`, name: "Catalog C", price: "10.00", cost: "5.00", stock: 5 }, actor);
    await updateProduct(product.id, { active: false });
    const visible = await listProducts({ q: `${tag}-C`, limit: 10, page: 1, includeInactive: false });
    expect(visible.items).toHaveLength(0);
    const all = await listProducts({ q: `${tag}-C`, limit: 10, page: 1, includeInactive: true });
    expect(all.items).toHaveLength(1);
    await expect(createOrder({ customerName: "Inactive Buyer", items: [{ productId: product.id, quantity: 1 }] }, actor)).rejects.toThrow();
  });

  it("records order and cancellation movements, single and bulk", async () => {
    const product = await createProduct({ sku: `${tag}-D`, name: "Catalog D", price: "10.00", cost: "5.00", stock: 10 }, actor);
    const first = await createOrder({ customerName: "Movements One", items: [{ productId: product.id, quantity: 2 }] }, actor);
    const second = await createOrder({ customerName: "Movements Two", items: [{ productId: product.id, quantity: 3 }] }, actor);
    const third = await createOrder({ customerName: "Movements Three", items: [{ productId: product.id, quantity: 1 }] }, actor);
    await updateOrderStatus(first.id, "CANCELLED", actor);
    await updateOrdersStatus([second.id, third.id], "CANCELLED", actor);

    const movements = await movementsFor(product.id);
    expect(movements.filter((movement) => movement.reason === "order").map((movement) => movement.delta).sort()).toEqual([-1, -2, -3]);
    const cancellations = movements.filter((movement) => movement.reason === "cancellation");
    expect(cancellations.map((movement) => movement.delta).sort()).toEqual([1, 2, 3]);
    expect(cancellations.every((movement) => movement.orderId !== null)).toBe(true);

    const [fresh] = await getDb().select().from(products).where(eq(products.id, product.id));
    expect(fresh.stock).toBe(10);
    const stockAfterValues = cancellations.map((movement) => movement.stockAfter);
    expect(Math.max(...stockAfterValues)).toBe(10);
  });

  it("resolves roles from ADMIN_EMAILS, the database and the fallback", async () => {
    const email = `role-${tag.toLowerCase()}@example.com`;
    expect(await resolveRole(email)).toBe("viewer");
    await getDb().insert(authUsers).values({ id: crypto.randomUUID(), email, role: "operator" });
    expect(await resolveRole(email)).toBe("operator");
    const previous = process.env.ADMIN_EMAILS;
    process.env.ADMIN_EMAILS = ` ${email.toUpperCase()} , other@example.com`;
    try {
      expect(await resolveRole(email)).toBe("admin");
    } finally {
      if (previous === undefined) delete process.env.ADMIN_EMAILS; else process.env.ADMIN_EMAILS = previous;
      await getDb().delete(authUsers).where(eq(authUsers.email, email));
    }
  });
});
