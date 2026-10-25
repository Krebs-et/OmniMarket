import {
  listApiRequestMetricsSince,
  pruneApiRequestMetricsBefore,
} from "@infrastructure/db/api-request-metrics";

const DAY_MS = 24 * 60 * 60 * 1000;
const RETENTION_MS = 30 * DAY_MS;
const FIVE_MINUTES_MS = 5 * 60 * 1000;
const ALERT_ERROR_RATE = 5;
const ALERT_P95_MS = 1000;
const LATENCY_BUCKETS = [
  { upperBoundMs: 50, field: "latencyLe50" },
  { upperBoundMs: 100, field: "latencyLe100" },
  { upperBoundMs: 250, field: "latencyLe250" },
  { upperBoundMs: 500, field: "latencyLe500" },
  { upperBoundMs: 1000, field: "latencyLe1000" },
  { upperBoundMs: 2000, field: "latencyLe2000" },
  { upperBoundMs: 5000, field: "latencyLe5000" },
] as const;

type MetricRows = Awaited<ReturnType<typeof listApiRequestMetricsSince>>;
type MetricRow = MetricRows[number];
export type PercentileEstimate = { upperBoundMs: number; exceedsRange: boolean } | null;
export type ApiRouteMetricSummary = {
  route: string;
  method: string;
  requestCount: number;
  clientErrorCount: number;
  serverErrorCount: number;
  slowRequestCount: number;
  errorRate: number;
  p50: PercentileEstimate;
  p95: PercentileEstimate;
  p99: PercentileEstimate;
};

function sum(rows: MetricRow[], field: keyof MetricRow) {
  return rows.reduce((total, row) => total + Number(row[field]), 0);
}

function percentile(rows: MetricRow[], percentileValue: number): PercentileEstimate {
  const requestCount = sum(rows, "requestCount");
  if (!requestCount) return null;

  const targetCount = Math.ceil(requestCount * percentileValue / 100);
  for (const bucket of LATENCY_BUCKETS) {
    if (sum(rows, bucket.field) >= targetCount) {
      return { upperBoundMs: bucket.upperBoundMs, exceedsRange: false };
    }
  }

  return { upperBoundMs: 5000, exceedsRange: true };
}

function summarize(rows: MetricRow[], route: string, method: string): ApiRouteMetricSummary {
  const requestCount = sum(rows, "requestCount");
  const clientErrorCount = sum(rows, "clientErrorCount");
  const serverErrorCount = sum(rows, "serverErrorCount");
  return {
    route,
    method,
    requestCount,
    clientErrorCount,
    serverErrorCount,
    slowRequestCount: sum(rows, "slowRequestCount"),
    errorRate: requestCount ? serverErrorCount / requestCount * 100 : 0,
    p50: percentile(rows, 50),
    p95: percentile(rows, 95),
    p99: percentile(rows, 99),
  };
}

function groupByRoute(rows: MetricRow[]) {
  const groups = new Map<string, MetricRow[]>();
  for (const row of rows) {
    const key = `${row.method} ${row.route}`;
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  }

  return [...groups.values()]
    .map((group) => summarize(group, group[0].route, group[0].method))
    .sort((a, b) => b.requestCount - a.requestCount);
}

export async function getApiObservability(now = new Date()) {
  const retentionCutoff = new Date(now.getTime() - RETENTION_MS);
  const dayStart = new Date(now.getTime() - DAY_MS);
  const recentWindowStart = new Date(
    Math.floor(now.getTime() / FIVE_MINUTES_MS) * FIVE_MINUTES_MS,
  );

  await pruneApiRequestMetricsBefore(retentionCutoff);
  const rows = await listApiRequestMetricsSince(dayStart);
  const recentRows = rows.filter((row) => row.bucketStart >= recentWindowStart);
  const recentByRoute = groupByRoute(recentRows);
  const alerts = recentByRoute.flatMap((route) => {
    const issues: string[] = [];
    if (route.errorRate > ALERT_ERROR_RATE) {
      issues.push(`Errores 5xx en ${route.errorRate.toFixed(1)}% de las solicitudes`);
    }
    if (route.p95 && (route.p95.exceedsRange || route.p95.upperBoundMs > ALERT_P95_MS)) {
      issues.push("Latencia p95 superior a 1 s");
    }
    return issues.map((message) => ({ method: route.method, route: route.route, message }));
  });

  const summary = summarize(rows, "Todas las rutas", "ALL");
  return {
    generatedAt: now,
    windowStart: dayStart,
    summary,
    routes: groupByRoute(rows),
    alerts,
    alertWindowStart: recentWindowStart,
  };
}
