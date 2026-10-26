import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@infrastructure/db/client";
import { orders } from "@infrastructure/db/schema";
import { evaluationApiDisabledResponse } from "@lib/evaluation-api";
import { withApiObservability } from "@lib/api-observability";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const querySchema = z.object({
  orderNumber: z.string().trim().min(1).max(40),
});

async function getEvaluationKanbanStatus(request: Request) {
  const disabledResponse = evaluationApiDisabledResponse();
  if (disabledResponse) return disabledResponse;

  const parsed = querySchema.safeParse({
    orderNumber: new URL(request.url).searchParams.get("orderNumber"),
  });
  if (!parsed.success) {
    return Response.json({ error: "A valid orderNumber is required" }, { status: 400 });
  }

  const [order] = await getDb()
    .select({
      orderNumber: orders.orderNumber,
      status: orders.status,
      updatedAt: orders.updatedAt,
    })
    .from(orders)
    .where(eq(orders.orderNumber, parsed.data.orderNumber))
    .limit(1);

  if (!order) return Response.json({ error: "Order not found" }, { status: 404 });
  return Response.json(order);
}

export const GET = withApiObservability("GET", "/api/test/kanban-status", getEvaluationKanbanStatus);
