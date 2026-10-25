import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { getDb } from "@infrastructure/db/client";
import { withApiObservability } from "@lib/api-observability";

export const dynamic = "force-dynamic";

async function healthCheckRoute(request: Request) {
  const start = performance.now();
  try {
    await getDb().execute(sql`select 1`);
    const databaseLatencyMs = Number((performance.now() - start).toFixed(2));
    return NextResponse.json(
      { status: "ok", database: "ok", databaseLatencyMs },
      { headers: { "Server-Timing": `db;dur=${databaseLatencyMs}` } },
    );
  } catch (error) {
    console.error(JSON.stringify({
      level: "error",
      event: "database_health_check_failed",
      requestId: request.headers.get("x-request-id") ?? request.headers.get("x-vercel-id") ?? "unknown",
      errorType: error instanceof Error ? error.name : "UnknownError",
      durationMs: Number((performance.now() - start).toFixed(2)),
    }));
    return NextResponse.json({ status: "error", database: "unavailable" }, { status: 503 });
  }
}

export const GET = withApiObservability("GET", "/api/health", healthCheckRoute);
