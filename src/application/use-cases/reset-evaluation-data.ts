import { getDb } from "@infrastructure/db/client";
import { orderItems, orders, products } from "@infrastructure/db/schema";

const evaluationProducts = [
  ["SKU-001", "Auriculares Pro", "129.90", "72.00", 24],
  ["SKU-002", "Teclado mecánico", "245.00", "132.00", 18],
  ["SKU-003", "Mouse ergonómico", "89.50", "44.00", 31],
  ["SKU-004", "Monitor ultrawide", "560.00", "318.00", 9],
  ["SKU-005", "Webcam 4K", "310.75", "165.00", 12],
  ["SKU-006", "Hub USB-C", "75.00", "39.00", 40],
] as const;

const evaluationOrders = [
  ["OM-1001", "Ana Martínez", "PENDING", "129.90", "72.00"],
  ["OM-1002", "Carlos López", "CONFIRMED", "245.00", "132.00"],
  ["OM-1003", "Sofía Ramírez", "PROCESSING", "89.50", "44.00"],
  ["OM-1004", "Diego Torres", "SHIPPED", "560.00", "318.00"],
  ["OM-1005", "Valentina Cruz", "DELIVERED", "310.75", "165.00"],
  ["OM-1006", "Mateo Hernández", "CANCELLED", "75.00", "39.00"],
] as const;

export async function resetEvaluationData() {
  return getDb().transaction(async (tx) => {
    await tx.delete(orders);
    await tx.delete(products);

    const insertedProducts = await tx.insert(products).values(
      evaluationProducts.map(([sku, name, price, cost, stock]) => ({
        sku,
        name,
        price,
        cost,
        stock,
      })),
    ).returning({ id: products.id, sku: products.sku });
    const productIdBySku = new Map(insertedProducts.map((product) => [product.sku, product.id]));

    const insertedOrders = await tx.insert(orders).values(
      evaluationOrders.map(([orderNumber, customerName, status, total, cost]) => ({
        orderNumber,
        customerName,
        status,
        total,
        cost,
      })),
    ).returning({ id: orders.id, orderNumber: orders.orderNumber });
    const orderIdByNumber = new Map(insertedOrders.map((order) => [order.orderNumber, order.id]));

    await tx.insert(orderItems).values(
      evaluationOrders.map(([orderNumber], index) => {
        const product = evaluationProducts[index];
        const productId = productIdBySku.get(product[0]);
        const orderId = orderIdByNumber.get(orderNumber);
        if (!productId || !orderId) throw new Error("Evaluation fixture relationship was not created");
        return {
          orderId,
          productId,
          quantity: 1,
          unitPrice: product[2],
          unitCost: product[3],
        };
      }),
    );

    return { orders: evaluationOrders.length, products: evaluationProducts.length };
  });
}
