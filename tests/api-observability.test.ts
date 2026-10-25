import { afterEach, describe, expect, it, vi } from "vitest";
import { withApiObservability } from "../src/lib/api-observability";

describe("API observability", () => {
  afterEach(() => vi.restoreAllMocks());

  it("adds request correlation and server timing and logs a successful route", async () => {
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    const handler = withApiObservability("GET", "/api/products", async () =>
      new Response("{}", { headers: { "Server-Timing": "db;dur=4.2" } }));
    const response = await handler(new Request("https://example.test/api/products?token=secret", {
      headers: { "x-request-id": "request-123" },
    }));

    expect(response.headers.get("x-request-id")).toBe("request-123");
    expect(response.headers.get("server-timing")).toMatch(/^db;dur=4\.2, app;dur=/);
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
    const logged = String(errorLog.mock.calls[0][0]);
    expect(JSON.parse(logged)).toMatchObject({
      event: "api_request_failed",
      route: "/api/orders",
      status: 500,
      errorType: "Error",
    });
    expect(logged).not.toContain("database password");
  });
});
