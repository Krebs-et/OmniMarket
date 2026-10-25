import { and, asc, eq, ilike, or, sql } from "drizzle-orm";
import { getDb } from "@infrastructure/db/client";
import { products } from "@infrastructure/db/schema";

export async function getProducts({ q, limit }: { q?: string; limit?: number } = {}) {
  const term = q?.trim();
  const pattern = term ? `%${term.replace(/[\\%_]/g, "\\$&")}%` : null;
  const query = getDb()
    .select()
    .from(products)
    .where(and(eq(products.active, true), pattern ? or(ilike(products.name, pattern), ilike(products.sku, pattern)) : undefined))
    .orderBy(asc(products.name));
  return limit ? query.limit(limit) : query;
}

export async function listProducts({ q, limit, page, includeInactive, lowStockOnly = false }: { q?: string; limit: number; page: number; includeInactive: boolean; lowStockOnly?: boolean }) {
  const term = q?.trim();
  const pattern = term ? `%${term.replace(/[\\%_]/g, "\\$&")}%` : null;
  const where = and(
    includeInactive ? undefined : eq(products.active, true),
    lowStockOnly ? sql`${products.stock} <= ${products.lowStockThreshold}` : undefined,
    pattern ? or(ilike(products.name, pattern), ilike(products.sku, pattern)) : undefined,
  );
  const activeWhere = and(eq(products.active, true), sql`${products.stock} <= ${products.lowStockThreshold}`);
  const [items, [{ total }], [{ lowStockTotal }]] = await Promise.all([
    getDb().select().from(products).where(where).orderBy(asc(products.name), asc(products.id)).limit(limit).offset((page - 1) * limit),
    getDb().select({ total: sql<number>`count(*)::int` }).from(products).where(where),
    getDb().select({ lowStockTotal: sql<number>`count(*)::int` }).from(products).where(activeWhere),
  ]);
  return { items, total, page, limit, lowStockTotal };
}
