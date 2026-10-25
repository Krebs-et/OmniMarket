import { recordApiRequestMetric } from "@infrastructure/db/api-request-metrics";
import { after } from "next/server";

const SLOW_REQUEST_THRESHOLD_MS = 1000;

type ApiLog = {
  level: "info" | "warn" | "error";
  event: "api_request" | "slow_api_request" | "api_request_failed";
  requestId: string;
  method: string;
  route: string;
  status: number;
  durationMs: number;
  outcome: "success" | "client_error" | "server_error";
  errorType?: string;
};

function logApiRequest(entry: ApiLog) {
  const serialized = JSON.stringify(entry);
  if (entry.level === "error") console.error(serialized);
  else if (entry.level === "warn") console.warn(serialized);
  else console.info(serialized);
}

function logMetricFailure(event: string, method: string, route: string, error: unknown) {
  console.error(JSON.stringify({
    level: "error",
    event,
    method,
    route,
    errorType: error instanceof Error ? error.name : "UnknownError",
  }));
}

function scheduleApiMetric(method: string, route: string, status: number, durationMs: number) {
  try {
    after(async () => {
      try {
        await recordApiRequestMetric({ method, route, status, durationMs });
      } catch (error) {
        logMetricFailure("api_metrics_persist_failed", method, route, error);
      }
    });
  } catch (error) {
    logMetricFailure("api_metrics_schedule_failed", method, route, error);
  }
}

export function withApiObservability<TRequest extends Request, TArgs extends unknown[]>(
  method: string,
  route: string,
  handler: (request: TRequest, ...args: TArgs) => Promise<Response>,
) {
  return async (request: TRequest, ...args: TArgs): Promise<Response> => {
    const startedAt = performance.now();
    const requestId = request.headers.get("x-request-id")
      ?? request.headers.get("x-vercel-id")
      ?? crypto.randomUUID();

    try {
      const response = await handler(request, ...args);
      const durationMs = Number((performance.now() - startedAt).toFixed(2));
      const outcome = response.status >= 500
        ? "server_error"
        : response.status >= 400
          ? "client_error"
          : "success";
      const slow = durationMs >= SLOW_REQUEST_THRESHOLD_MS;
      logApiRequest({
        level: outcome === "server_error" ? "error" : slow ? "warn" : "info",
        event: outcome === "server_error" ? "api_request_failed" : slow ? "slow_api_request" : "api_request",
        requestId,
        method,
        route,
        status: response.status,
        durationMs,
        outcome,
      });
      scheduleApiMetric(method, route, response.status, durationMs);
      response.headers.set("X-Request-Id", requestId);
      const priorTiming = response.headers.get("Server-Timing");
      response.headers.set("Server-Timing", [priorTiming, `app;dur=${durationMs}`].filter(Boolean).join(", "));
      return response;
    } catch (error) {
      const durationMs = Number((performance.now() - startedAt).toFixed(2));
      logApiRequest({
        level: "error",
        event: "api_request_failed",
        requestId,
        method,
        route,
        status: 500,
        durationMs,
        outcome: "server_error",
        errorType: error instanceof Error ? error.name : "UnknownError",
      });
      scheduleApiMetric(method, route, 500, durationMs);
      throw error;
    }
  };
}
