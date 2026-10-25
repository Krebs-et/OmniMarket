import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { getApiObservability } from "@application/use-cases/get-api-observability";
import { closeDb, getDb } from "@infrastructure/db/client";
import { recordApiRequestMetric } from "@infrastructure/db/api-request-metrics";
import { apiRequestMetrics } from "@infrastructure/db/schema";

const route = `/api/observability-test-${Date.now()}`;
const now = new Date();
const staleRoute = `${route}-stale`;

describe("API observability integration", () => {
  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL is required for integration tests");
    }

    for (let index = 0; index < 19; index += 1) {
      await recordApiRequestMetric({
        method: "GET",
        route,
        status: 200,
        durationMs: 100,
        recordedAt: now,
      });
    }
    for (let index = 0; index < 2; index += 1) {
      await recordApiRequestMetric({
        method: "GET",
        route,
        status: 503,
        durationMs: 1500,
        recordedAt: now,
      });
    }
    await recordApiRequestMetric({
      method: "GET",
      route: staleRoute,
      status: 200,
      durationMs: 10,
      recordedAt: new Date(now.getTime() - 31 * 24 * 60 * 60 * 1000),
    });
  });

  afterAll(async () => {
    await getDb().delete(apiRequestMetrics).where(eq(apiRequestMetrics.route, route));
    await getDb().delete(apiRequestMetrics).where(eq(apiRequestMetrics.route, staleRoute));
    await closeDb();
  });

  it("aggregates requests, approximates latency percentiles, raises threshold alerts, and prunes expired buckets", async () => {
    const snapshot = await getApiObservability(now);
    const routeSummary = snapshot.routes.find((summary) => summary.route === route);

    expect(routeSummary).toMatchObject({
      method: "GET",
      requestCount: 21,
      serverErrorCount: 2,
      slowRequestCount: 2,
      errorRate: expect.closeTo(9.52, 1),
      p50: { upperBoundMs: 100, exceedsRange: false },
      p95: { upperBoundMs: 2000, exceedsRange: false },
    });
    expect(snapshot.alerts.filter((alert) => alert.route === route)).toHaveLength(2);

    const staleRows = await getDb().select().from(apiRequestMetrics)
      .where(eq(apiRequestMetrics.route, staleRoute));
    expect(staleRows).toHaveLength(0);
  });
});
