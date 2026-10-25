import { desc, gte, lt, sql } from "drizzle-orm";
import { apiRequestMetrics, type ApiRequestMetric } from "./schema";
import { getDb } from "./client";

export type ApiRequestMetricInput = {
  method: string;
  route: string;
  status: number;
  durationMs: number;
  recordedAt?: Date;
};

const BUCKET_DURATION_MS = 5 * 60 * 1000;
const LATENCY_BUCKETS = [
  { field: "latencyLe50", upperBoundMs: 50 },
  { field: "latencyLe100", upperBoundMs: 100 },
  { field: "latencyLe250", upperBoundMs: 250 },
  { field: "latencyLe500", upperBoundMs: 500 },
  { field: "latencyLe1000", upperBoundMs: 1000 },
  { field: "latencyLe2000", upperBoundMs: 2000 },
  { field: "latencyLe5000", upperBoundMs: 5000 },
] as const;

type LatencyField = (typeof LATENCY_BUCKETS)[number]["field"] | "latencyGt5000";

export function getMetricBucketStart(recordedAt: Date) {
  return new Date(Math.floor(recordedAt.getTime() / BUCKET_DURATION_MS) * BUCKET_DURATION_MS);
}

function getLatencyField(durationMs: number): LatencyField {
  return LATENCY_BUCKETS.find(({ upperBoundMs }) => durationMs <= upperBoundMs)?.field ?? "latencyGt5000";
}

export async function recordApiRequestMetric(input: ApiRequestMetricInput) {
  const bucketStart = getMetricBucketStart(input.recordedAt ?? new Date());
  const latencyField = getLatencyField(input.durationMs);
  const current = apiRequestMetrics;
  const increments = {
    requestCount: sql`${current.requestCount} + 1`,
    clientErrorCount: sql`${current.clientErrorCount} + ${input.status >= 400 && input.status < 500 ? 1 : 0}`,
    serverErrorCount: sql`${current.serverErrorCount} + ${input.status >= 500 ? 1 : 0}`,
    slowRequestCount: sql`${current.slowRequestCount} + ${input.durationMs >= 1000 ? 1 : 0}`,
    latencyLe50: sql`${current.latencyLe50} + ${input.durationMs <= 50 ? 1 : 0}`,
    latencyLe100: sql`${current.latencyLe100} + ${input.durationMs <= 100 ? 1 : 0}`,
    latencyLe250: sql`${current.latencyLe250} + ${input.durationMs <= 250 ? 1 : 0}`,
    latencyLe500: sql`${current.latencyLe500} + ${input.durationMs <= 500 ? 1 : 0}`,
    latencyLe1000: sql`${current.latencyLe1000} + ${input.durationMs <= 1000 ? 1 : 0}`,
    latencyLe2000: sql`${current.latencyLe2000} + ${input.durationMs <= 2000 ? 1 : 0}`,
    latencyLe5000: sql`${current.latencyLe5000} + ${input.durationMs <= 5000 ? 1 : 0}`,
    latencyGt5000: sql`${current.latencyGt5000} + ${input.durationMs > 5000 ? 1 : 0}`,
  };

  await getDb().insert(apiRequestMetrics).values({
    bucketStart,
    method: input.method,
    route: input.route,
    requestCount: 1,
    clientErrorCount: input.status >= 400 && input.status < 500 ? 1 : 0,
    serverErrorCount: input.status >= 500 ? 1 : 0,
    slowRequestCount: input.durationMs >= 1000 ? 1 : 0,
    [latencyField]: 1,
  }).onConflictDoUpdate({
    target: [apiRequestMetrics.bucketStart, apiRequestMetrics.route, apiRequestMetrics.method],
    set: increments,
  });
}

export async function listApiRequestMetricsSince(since: Date): Promise<ApiRequestMetric[]> {
  return getDb().select().from(apiRequestMetrics)
    .where(gte(apiRequestMetrics.bucketStart, since))
    .orderBy(desc(apiRequestMetrics.bucketStart), apiRequestMetrics.route, apiRequestMetrics.method);
}

export async function pruneApiRequestMetricsBefore(before: Date) {
  await getDb().delete(apiRequestMetrics).where(lt(apiRequestMetrics.bucketStart, before));
}
