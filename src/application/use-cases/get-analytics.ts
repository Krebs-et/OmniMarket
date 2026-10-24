import { getDb } from "@infrastructure/db/client";
import { orders } from "@infrastructure/db/schema";
import { calculateAverageTicket, calculateMargin, calculateNetProfit } from "@domain/services/financial-calculator";

export async function getAnalytics() {
  const rows = await getDb().select().from(orders);
  const totalSales = rows.reduce((sum, order) => sum + Number(order.total), 0);
  const totalCost = rows.reduce((sum, order) => sum + Number(order.cost), 0);
  const ordersByStatus = rows.reduce<Record<string, number>>((counts, order) => {
    counts[order.status] = (counts[order.status] ?? 0) + 1;
    return counts;
  }, {});

  return {
    totalOrders: rows.length,
    totalSales,
    totalCost,
    averageTicket: calculateAverageTicket(totalSales, rows.length),
    margin: calculateMargin(totalSales, totalCost),
    netProfit: calculateNetProfit(totalSales, totalCost),
    ordersByStatus,
  };
}
