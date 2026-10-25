import { and, eq, gte, sql } from "drizzle-orm";
import { getDb } from "@infrastructure/db/client";
import { products, stockMovements } from "@infrastructure/db/schema";

export class DuplicateSkuError extends Error {}
export class InsufficientAdjustmentError extends Error {}

export async function createProduct(input: { sku: string; name: string; price: string; cost: string; stock: number; lowStockThreshold?: number }, actorEmail: string) {
  return getDb().transaction(async (tx) => {
    const [created] = await tx.insert(products).values({
      ...input,
      lowStockThreshold: input.lowStockThreshold ?? 5,
      sku: input.sku.toUpperCase(),
    }).onConflictDoNothing({ target: products.sku }).returning();
    if (!created) throw new DuplicateSkuError("SKU already exists");
    if (created.stock > 0) {
      await tx.insert(stockMovements).values({ productId: created.id, delta: created.stock, stockAfter: created.stock, reason: "initial", actorEmail });
    }
    return created;
  });
}

export async function updateProduct(id: string, changes: { name?: string; price?: string; cost?: string; active?: boolean; lowStockThreshold?: number }) {
  const [updated] = await getDb().update(products).set({ ...changes, updatedAt: new Date() }).where(eq(products.id, id)).returning();
  return updated ?? null;
}

// Stock never goes negative: the guard lives in the UPDATE itself so concurrent adjustments cannot race past it.
export async function adjustStock(id: string, delta: number, note: string | undefined, actorEmail: string) {
  return getDb().transaction(async (tx) => {
    const [updated] = await tx.update(products)
      .set({ stock: sql`${products.stock} + ${delta}`, updatedAt: new Date() })
      .where(and(eq(products.id, id), gte(sql`${products.stock} + ${delta}`, 0)))
      .returning();
    if (!updated) {
      const [exists] = await tx.select({ id: products.id }).from(products).where(eq(products.id, id)).limit(1);
      if (!exists) return null;
      throw new InsufficientAdjustmentError("Adjustment would leave negative stock");
    }
    await tx.insert(stockMovements).values({ productId: id, delta, stockAfter: updated.stock, reason: "adjustment", note, actorEmail });
    return updated;
  });
}
