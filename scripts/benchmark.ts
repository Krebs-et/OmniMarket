// Benchmark de casos de uso contra PostgreSQL local. Rechaza hosts remotos para no tocar RDS.
// Uso: BENCH_DATABASE_URL=postgres://...@localhost:5434/omnimarket_bench pnpm bench
import { sql } from "drizzle-orm";
import { performance } from "node:perf_hooks";

const url = process.env.BENCH_DATABASE_URL;
if (!url) throw new Error("BENCH_DATABASE_URL is required");
const host = new URL(url).hostname;
if (!["localhost", "127.0.0.1", "::1"].includes(host)) throw new Error("Benchmark only runs against a local database");
process.env.DATABASE_URL = url;

const ORDERS = Number(process.env.BENCH_ORDERS ?? 20000);
const PRODUCTS = Number(process.env.BENCH_PRODUCTS ?? 1000);
const SAMPLES = Number(process.env.BENCH_SAMPLES ?? 200);
const STATUSES = ["PENDING", "CONFIRMED", "PROCESSING", "SHIPPED", "DELIVERED", "CANCELLED"] as const;

function percentile(sorted: number[], p: number) {
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
}

async function measure(name: string, fn: () => Promise<unknown>, samples = SAMPLES) {
  for (let i = 0; i < 5; i++) await fn();
  const times: number[] = [];
  for (let i = 0; i < samples; i++) {
    const start = performance.now();
    await fn();
    times.push(performance.now() - start);
  }
  times.sort((a, b) => a - b);
  return {
    operation: name,
    samples,
    "p50 ms": +percentile(times, 50).toFixed(2),
    "p95 ms": +percentile(times, 95).toFixed(2),
    "p99 ms": +percentile(times, 99).toFixed(2),
  };
}

async function main() {
  const { closeDb, getDb } = await import("@infrastructure/db/client");
  const { orderItems, orders, products } = await import("@infrastructure/db/schema");
  const { getOrders } = await import("@application/use-cases/get-orders");
  const { getAnalytics } = await import("@application/use-cases/get-analytics");
  const { listProducts } = await import("@application/use-cases/get-products");
  const { createOrder } = await import("@application/use-cases/create-order");
  const db = getDb();

  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(orders);
  if (count === 0) {
    console.log(`Seeding ${ORDERS} orders and ${PRODUCTS} products...`);
    await db.insert(products).values(Array.from({ length: PRODUCTS }, (_, i) => ({
      sku: `BENCH-${i}`, name: `Producto bench ${i}`, price: "10.00", cost: "4.00", stock: 1_000_000,
    })));
    const productRows = await db.select({ id: products.id }).from(products);
    for (let offset = 0; offset < ORDERS; offset += 2000) {
      const batch = Array.from({ length: Math.min(2000, ORDERS - offset) }, (_, k) => {
        const i = offset + k;
        return {
          orderNumber: `BENCH-${i}`, customerName: `Cliente ${i % 500}`, status: STATUSES[i % STATUSES.length],
          total: "30.00", cost: "12.00", createdAt: new Date(Date.now() - i * 60_000),
        };
      });
      const inserted = await db.insert(orders).values(batch).returning({ id: orders.id });
      await db.insert(orderItems).values(inserted.flatMap((order, k) =>
        Array.from({ length: 3 }, (_, j) => ({
          orderId: order.id, productId: productRows[(offset + k + j) % productRows.length].id,
          quantity: 1, unitPrice: "10.00", unitCost: "4.00",
        }))));
    }
    await db.execute(sql`analyze`);
  }

  const [orderCount] = await db.select({ count: sql<number>`count(*)::int` }).from(orders);
  const [productCount] = await db.select({ count: sql<number>`count(*)::int` }).from(products);
  console.log(`Dataset: ${orderCount.count} orders, ${productCount.count} products, ~3 lines/order; samples=${SAMPLES}; sequential, single connection\n`);

  const productIds = (await db.select({ id: products.id }).from(products).limit(50)).map((p) => p.id);
  const results = [
    await measure("getOrders page 1 (limit 20)", () => getOrders({ page: 1, limit: 20 })),
    await measure("getOrders deep page 500", () => getOrders({ page: 500, limit: 20 })),
    await measure("getOrders status=PENDING", () => getOrders({ page: 1, limit: 20, status: "PENDING" })),
    await measure("getOrders search q=Cliente 42", () => getOrders({ page: 1, limit: 20, q: "Cliente 42" })),
    await measure("getOrders sort customer", () => getOrders({ page: 1, limit: 20, sort: "customer", dir: "asc" })),
    await measure("getAnalytics", () => getAnalytics()),
    await measure("listProducts page 1", () => listProducts({ page: 1, limit: 20, includeInactive: false })),
    await measure("listProducts search", () => listProducts({ page: 1, limit: 20, q: "bench 99", includeInactive: false })),
    await measure("createOrder 1 line", () => createOrder({ customerName: "Bench", items: [{ productId: productIds[0], quantity: 1 }] }, "bench"), 100),
    await measure("createOrder 50 lines", () => createOrder({ customerName: "Bench", items: productIds.map((productId) => ({ productId, quantity: 1 })) }, "bench"), 50),
  ];
  console.table(results);
  await closeDb();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
