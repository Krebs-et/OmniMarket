import { asc, ilike, or } from "drizzle-orm";
import { getDb } from "@infrastructure/db/client";
import { products } from "@infrastructure/db/schema";

export async function getProducts({ q, limit }: { q?: string; limit?: number } = {}) {
  const term = q?.trim();
  const pattern = term ? `%${term.replace(/[\\%_]/g, "\\$&")}%` : null;
  const query = getDb()
    .select()
    .from(products)
    .where(pattern ? or(ilike(products.name, pattern), ilike(products.sku, pattern)) : undefined)
    .orderBy(asc(products.name));
  return limit ? query.limit(limit) : query;
}
