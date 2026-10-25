import { afterEach, describe, expect, it, vi } from "vitest";
import { recordApiRequestMetric } from "@infrastructure/db/api-request-metrics";
import { withApiObservability } from "../src/lib/api-observability";

const deferred = vi.hoisted(() => ({ callbacks: [] as Array<() => Promise<void>> }));

vi.mock("@infrastructure/db/api-request-metrics", () => ({
  recordApiRequestMetric: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("next/server", () => ({
  after: (callback: () => Promise<void>) => deferred.callbacks.push(callback),
}));

describe("API observability", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.mocked(recordApiRequestMetric).mockReset().mockResolvedValue(undefined);
    deferred.callbacks.length = 0;
  });

  it("adds request correlation and server timing and logs a successful route", async () => {
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    const handler = withApiObservability("GET", "/api/products", async () =>
      new Response("{}", { headers: { "Server-Timing": "db;dur=4.2" } }));
    const response = await handler(new Request("https://example.test/api/products?token=secret", {
      headers: { "x-request-id": "request-123" },
    }));
    await deferred.callbacks[0]();

    expect(response.headers.get("x-request-id")).toBe("request-123");
    expect(response.headers.get("server-timing")).toMatch(/^db;dur=4\.2, app;dur=/);
    expect(recordApiRequestMetric).toHaveBeenCalledWith(expect.objectContaining({
      method: "GET",
      route: "/api/products",
      status: 200,
    }));
    const event = JSON.parse(String(log.mock.calls[0][0]));
    expect(event).toMatchObject({
      level: "info",
      event: "api_request",
      requestId: "request-123",
      method: "GET",
      route: "/api/products",
      status: 200,
      outcome: "success",
    });
    expect(String(log.mock.calls[0][0])).not.toContain("secret");
  });

  it("logs returned server errors with their response status", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const handler = withApiObservability("GET", "/api/health", async () =>
      new Response("unavailable", { status: 503 }));
    await handler(new Request("https://example.test/api/health"));
    await deferred.callbacks[0]();

    expect(JSON.parse(String(error.mock.calls[0][0]))).toMatchObject({
      level: "error",
      event: "api_request_failed",
      route: "/api/health",
      status: 503,
      outcome: "server_error",
    });
  });

  it("marks requests at or above one second as slow", async () => {
    vi.spyOn(performance, "now").mockReturnValueOnce(10).mockReturnValueOnce(1010);
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    const handler = withApiObservability("GET", "/api/analytics", async () => new Response("{}"));
    await handler(new Request("https://example.test/api/analytics"));
    await deferred.callbacks[0]();

    expect(JSON.parse(String(warning.mock.calls[0][0]))).toMatchObject({
      level: "warn",
      event: "slow_api_request",
      route: "/api/analytics",
      durationMs: 1000,
      status: 200,
    });
  });

  it("logs thrown route failures without exposing their message and rethrows them", async () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    const failure = new Error("database password should not be logged");
    const handler = withApiObservability("POST", "/api/orders", async () => {
      throw failure;
    });

    await expect(handler(new Request("https://example.test/api/orders"))).rejects.toBe(failure);
    await deferred.callbacks[0]();
    const logged = String(errorLog.mock.calls[0][0]);
    expect(JSON.parse(logged)).toMatchObject({
      event: "api_request_failed",
      route: "/api/orders",
      status: 500,
      errorType: "Error",
    });
    expect(logged).not.toContain("database password");
  });

  it("keeps the route response when metric persistence fails and logs a sanitized error", async () => {
    vi.mocked(recordApiRequestMetric).mockRejectedValueOnce(new Error("private database details"));
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    const handler = withApiObservability("GET", "/api/health", async () => new Response("ok"));

    const response = await handler(new Request("https://example.test/api/health"));
    await deferred.callbacks[0]();

    expect(response.status).toBe(200);
    const telemetryError = errorLog.mock.calls
      .map(([value]) => JSON.parse(String(value)))
      .find((entry) => entry.event === "api_metrics_persist_failed");
    expect(telemetryError).toMatchObject({
      method: "GET",
      route: "/api/health",
      errorType: "Error",
    });
    expect(JSON.stringify(telemetryError)).not.toContain("private database details");
  });
});
