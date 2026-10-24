export function calculateAverageTicket(totalSales: number, totalOrders: number): number {
  return totalOrders === 0 ? 0 : totalSales / totalOrders;
}

export function calculateMargin(totalSales: number, totalCost: number): number {
  return totalSales === 0 ? 0 : ((totalSales - totalCost) / totalSales) * 100;
}

export function calculateNetProfit(totalSales: number, totalCost: number): number {
  return totalSales - totalCost;
}
