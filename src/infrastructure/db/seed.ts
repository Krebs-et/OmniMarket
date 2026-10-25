import "dotenv/config";
import { closeDb, getDb } from "./client";
import { orderItems, orders, products } from "./schema";

const seedOrders = [
  ["OM-1001", "Ana Martínez", "PENDING", "129.90", "72.00"],
  ["OM-1002", "Carlos López", "CONFIRMED", "245.00", "132.00"],
  ["OM-1003", "Sofía Ramírez", "PROCESSING", "89.50", "44.00"],
  ["OM-1004", "Diego Torres", "SHIPPED", "560.00", "318.00"],
  ["OM-1005", "Valentina Cruz", "DELIVERED", "310.75", "165.00"],
  ["OM-1006", "Mateo Hernández", "CANCELLED", "75.00", "39.00"],
] as const;

const seedProducts = [
  ["SKU-001", "Auriculares Pro", "129.90", "72.00", 24],
  ["SKU-002", "Teclado mecánico", "245.00", "132.00", 18],
  ["SKU-003", "Mouse ergonómico", "89.50", "44.00", 31],
  ["SKU-004", "Monitor ultrawide", "560.00", "318.00", 9],
  ["SKU-005", "Webcam 4K", "310.75", "165.00", 12],
  ["SKU-006", "Hub USB-C", "75.00", "39.00", 40],
] as const;

async function seed() {
  const db = getDb();
  await db.delete(orders);
  await db.delete(products);
  const insertedProducts = await db.insert(products).values(
    seedProducts.map(([sku, name, price, cost, stock]) => ({
      sku,
      name,
      price,
      cost,
      stock,
    })),
  ).returning();

  const insertedOrders = await db.insert(orders).values(
    seedOrders.map(([orderNumber, customerName, status, total, cost]) => ({
      orderNumber,
      customerName,
      status,
      total,
      cost,
    })),
  ).returning();

  await db.insert(orderItems).values(
    insertedOrders.map((order, index) => ({
      orderId: order.id,
      productId: insertedProducts[index].id,
      quantity: 1,
      unitPrice: insertedProducts[index].price,
      unitCost: insertedProducts[index].cost,
    })),
  );

  console.log(`Seeded ${seedOrders.length} orders and ${seedProducts.length} products`);
  await closeDb();
}

seed().catch((error: unknown) => {
  console.error("Failed to seed database", error);
  process.exitCode = 1;
});
