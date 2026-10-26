import { desc } from "drizzle-orm";
import { z } from "zod";
import { getAnalytics } from "@application/use-cases/get-analytics";
import { getDb } from "@infrastructure/db/client";
import { orders } from "@infrastructure/db/schema";
import { evaluationApiDisabledResponse } from "@lib/evaluation-api";
import { withApiObservability } from "@lib/api-observability";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const querySchema = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(50),
});

async function getEvaluationAnalytics(request: Request) {
  const disabledResponse = evaluationApiDisabledResponse();
  if (disabledResponse) return disabledResponse;

  const parsed = querySchema.safeParse({
    page: new URL(request.url).searchParams.get("page") ?? undefined,
    limit: new URL(request.url).searchParams.get("limit") ?? undefined,
  });
  if (!parsed.success) {
    return Response.json({ error: "Invalid pagination parameters" }, { status: 400 });
  }

  const { page, limit } = parsed.data;
  const offset = (page - 1) * limit;
  const db = getDb();
  const [analytics, items] = await Promise.all([
    getAnalytics(),
    db.select({
      orderNumber: orders.orderNumber,
      customerName: orders.customerName,
      status: orders.status,
      total: orders.total,
      createdAt: orders.createdAt,
    })
      .from(orders)
      .orderBy(desc(orders.createdAt), desc(orders.id))
      .limit(limit)
      .offset(offset),
  ]);

  return Response.json({
    ...analytics,
    items,
    total: analytics.totalOrders,
    page,
    limit,
  });
}

export const GET = withApiObservability("GET", "/api/test/analytics", getEvaluationAnalytics);
