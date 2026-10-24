import "dotenv/config";
import { closeDb, getDb } from "./client";
import { orders } from "./schema";

const seedOrders = [
  ["OM-1001", "Ana Martínez", "PENDING", "129.90", "72.00"],
  ["OM-1002", "Carlos López", "CONFIRMED", "245.00", "132.00"],
  ["OM-1003", "Sofía Ramírez", "PROCESSING", "89.50", "44.00"],
  ["OM-1004", "Diego Torres", "SHIPPED", "560.00", "318.00"],
  ["OM-1005", "Valentina Cruz", "DELIVERED", "310.75", "165.00"],
  ["OM-1006", "Mateo Hernández", "CANCELLED", "75.00", "39.00"],
] as const;

async function seed() {
  await getDb().delete(orders);
  await getDb().insert(orders).values(
    seedOrders.map(([orderNumber, customerName, status, total, cost]) => ({
      orderNumber,
      customerName,
      status,
      total,
      cost,
    })),
  );

  console.log(`Seeded ${seedOrders.length} orders`);
  await closeDb();
}

seed().catch((error: unknown) => {
  console.error("Failed to seed database", error);
  process.exitCode = 1;
});
