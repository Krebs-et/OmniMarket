import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

type Store = Map<string, unknown>;

async function loadMiddleware(env: Record<string, string | undefined>, store: Store = new Map(), limiterSuccess = true) {
  vi.resetModules();
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) vi.stubEnv(key, ""); else vi.stubEnv(key, value);
  }
  vi.doMock("@upstash/redis", () => ({
    Redis: class {
      async get(key: string) { return store.get(key) ?? null; }
      async set(key: string, value: unknown) { store.set(key, value); return "OK"; }
      async incr(key: string) { const next = Number(store.get(key) ?? 0) + 1; store.set(key, next); return next; }
      async expire() { return 1; }
      async del(key: string) { store.delete(key); return 1; }
    },
  }));
  vi.doMock("@upstash/ratelimit", () => ({
    Ratelimit: class {
      static slidingWindow() { return {}; }
      async limit() { return { success: limiterSuccess, limit: 100, remaining: limiterSuccess ? 99 : 0, reset: 0 }; }
    },
  }));
  return (await import("../src/middleware")).middleware;
}

const request = (path: string, headers: Record<string, string> = {}) => new NextRequest(`http://localhost${path}`, { headers });
const production = { NODE_ENV: "production", APP_ENV: "production" };
const redis = { UPSTASH_REDIS_REST_URL: "http://redis.test", UPSTASH_REDIS_REST_TOKEN: "token" };

describe("middleware", () => {
  beforeEach(() => vi.unstubAllEnvs());
  afterEach(() => { vi.unstubAllEnvs(); vi.doUnmock("@upstash/redis"); vi.doUnmock("@upstash/ratelimit"); });

  it("sets security headers and a per-request CSP nonce on pages", async () => {
    const middleware = await loadMiddleware(production);
    const response = await middleware(request("/login"));
    expect(response.headers.get("x-frame-options")).toBe("DENY");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("x-request-id")).toBeTruthy();
    expect(response.headers.get("content-security-policy")).toMatch(/script-src 'self' 'nonce-[^']+' 'strict-dynamic'/);
  });

  it("uses the Vercel request id for response correlation", async () => {
    const middleware = await loadMiddleware(production);
    const response = await middleware(request("/api/orders", {
      "x-real-ip": "198.51.100.1",
      "x-vercel-id": "vercel-request-123",
    }));
    expect(response.headers.get("x-request-id")).toBe("vercel-request-123");
  });

  it("fails closed with 503 on API routes when Upstash is not configured in production", async () => {
    const middleware = await loadMiddleware({ ...production, UPSTASH_REDIS_REST_URL: "", UPSTASH_REDIS_REST_TOKEN: "" });
    const response = await middleware(request("/api/orders", { "x-real-ip": "198.51.100.1" }));
    expect(response.status).toBe(503);
    expect((await response.json()).error).toMatch(/not configured/);
  });

  it("does not block the health check when Upstash is missing", async () => {
    const middleware = await loadMiddleware({ ...production, UPSTASH_REDIS_REST_URL: "", UPSTASH_REDIS_REST_TOKEN: "" });
    const response = await middleware(request("/api/health"));
    expect(response.status).toBe(200);
  });

  it("allows known routes and exposes rate-limit headers when configured", async () => {
    const middleware = await loadMiddleware({ ...production, ...redis });
    const response = await middleware(request("/api/orders", { "x-real-ip": "198.51.100.2" }));
    expect(response.status).toBe(200);
    expect(response.headers.get("x-ratelimit-limit")).toBe("100");
  });

  it("returns 503 in production without a trusted x-real-ip", async () => {
    const middleware = await loadMiddleware({ ...production, ...redis });
    const response = await middleware(request("/api/orders", { "x-forwarded-for": "203.0.113.9" }));
    expect(response.status).toBe(503);
  });

  it("returns 429 with headers when the limiter rejects", async () => {
    const middleware = await loadMiddleware({ ...production, ...redis }, new Map(), false);
    const response = await middleware(request("/api/orders", { "x-real-ip": "198.51.100.3" }));
    expect(response.status).toBe(429);
    expect(response.headers.get("x-ratelimit-remaining")).toBe("0");
  });

  it("returns 404 for unknown API paths and bans the IP after repeated scans", async () => {
    const store: Store = new Map();
    const middleware = await loadMiddleware({ ...production, ...redis }, store);
    const headers = { "x-real-ip": "198.51.100.4" };
    for (let i = 0; i < 3; i++) expect((await middleware(request("/api/test/reset-data", headers))).status).toBe(404);
    expect(store.get("omnimarket:banned:198.51.100.4")).toBe("1");
    const banned = await middleware(request("/api/orders", headers));
    expect(banned.status).toBe(403);
  });
});
