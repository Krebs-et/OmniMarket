import { count, sql } from "drizzle-orm";
import { getDb } from "@infrastructure/db/client";
import { orders } from "@infrastructure/db/schema";
import { calculateAverageTicket, calculateMargin, calculateNetProfit } from "@domain/services/financial-calculator";

export async function getAnalytics() {
  const rows = await getDb()
    .select({
      status: orders.status,
      orders: count(),
      sales: sql<string>`coalesce(sum(${orders.total}), 0)`,
      cost: sql<string>`coalesce(sum(${orders.cost}), 0)`,
    })
    .from(orders)
    .groupBy(orders.status);

  const ordersByStatus: Record<string, number> = {};
  let totalOrders = 0;
  let totalSales = 0;
  let totalCost = 0;
  for (const row of rows) {
    ordersByStatus[row.status] = row.orders;
    totalOrders += row.orders;
    totalSales += Number(row.sales);
    totalCost += Number(row.cost);
  }

  return {
    totalOrders,
    totalSales,
    totalCost,
    averageTicket: calculateAverageTicket(totalSales, totalOrders),
    margin: calculateMargin(totalSales, totalCost),
    netProfit: calculateNetProfit(totalSales, totalCost),
    ordersByStatus,
  };
}
