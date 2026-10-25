import { asc } from "drizzle-orm";
import { getDb } from "@infrastructure/db/client";
import { products } from "@infrastructure/db/schema";

export async function getProducts() {
  return getDb().select().from(products).orderBy(asc(products.name));
}
