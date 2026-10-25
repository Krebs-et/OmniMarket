import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import type { NextRequest } from "next/server";

const BAN_TTL_SECONDS = 24 * 60 * 60;
const ABUSE_WINDOW_SECONDS = 60;
const redis = process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
  ? new Redis({ url: process.env.UPSTASH_REDIS_REST_URL, token: process.env.UPSTASH_REDIS_REST_TOKEN })
  : null;
const generalLimiter = redis ? new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(100, "1 m"),
  prefix: "omnimarket:ratelimit:general",
}) : null;
const analyticsLimiter = redis ? new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(30, "10 s"),
  prefix: "omnimarket:ratelimit:analytics",
}) : null;

export function getClientIp(request: Pick<NextRequest, "headers">) {
  const trustedProxyIp = request.headers.get("x-real-ip")?.trim();
  if (trustedProxyIp) return trustedProxyIp;
  if (redisRequired()) return "unknown";
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

export function isKnownApiPath(pathname: string) {
  return pathname === "/api/orders"
    || pathname === "/api/analytics"
    || pathname === "/api/products"
    || pathname === "/api/health"
    || /^\/api\/orders\/[0-9a-f-]+\/(status|history)$/i.test(pathname)
    || pathname.startsWith("/api/auth/");
}

function redisRequired() {
  return process.env.NODE_ENV === "production" || process.env.APP_ENV === "production";
}

async function incrementWindow(key: string) {
  if (!redis) return 0;
  const count = await redis.incr(key);
  if (count === 1) await redis.expire(key, ABUSE_WINDOW_SECONDS);
  return count;
}

async function banIp(ip: string) {
  if (redis) await redis.set("omnimarket:banned:" + ip, "1", { ex: BAN_TTL_SECONDS });
}

export async function recordAuthenticationFailure(request: Pick<NextRequest, "headers">) {
  if (!redis) return;
  const ip = getClientIp(request);
  if (ip === "unknown") return;
  const failures = await incrementWindow("omnimarket:auth-failures:" + ip);
  if (failures > 15) await banIp(ip);
}

export async function checkApiRequest(request: NextRequest) {
  const ip = getClientIp(request);
  if (!redis || !generalLimiter || !analyticsLimiter) {
    return redisRequired()
      ? { allowed: false as const, status: 503, error: "Rate limiting service is not configured" }
      : { allowed: true as const, limit: null, remaining: null, reset: null };
  }

  if (ip === "unknown") {
    return { allowed: false as const, status: 503, error: "Trusted client IP is unavailable" };
  }

  if (await redis.get("omnimarket:banned:" + ip)) {
    return { allowed: false as const, status: 403, error: "IP temporarily suspended for anomalous activity" };
  }

  const general = await generalLimiter.limit(ip);
  const analytics = request.nextUrl.pathname === "/api/analytics"
    ? await analyticsLimiter.limit(ip)
    : null;
  const result = analytics && !analytics.success ? analytics : general;
  if (!general.success || (analytics && !analytics.success)) {
    const violations = await incrementWindow("omnimarket:ratelimit-violations:" + ip);
    if (violations > 3) await banIp(ip);
    return {
      allowed: false as const,
      status: 429,
      error: "Too many requests",
      limit: result.limit,
      remaining: result.remaining,
      reset: result.reset,
    };
  }

  await redis.del("omnimarket:ratelimit-violations:" + ip);
  return {
    allowed: true as const,
    limit: general.limit,
    remaining: general.remaining,
    reset: general.reset,
  };
}

export async function recordUnknownApiPath(request: Pick<NextRequest, "headers">) {
  if (!redis) return;
  const ip = getClientIp(request);
  if (ip === "unknown") return;
  const scans = await incrementWindow("omnimarket:unknown-api-paths:" + ip);
  if (scans >= 3) await banIp(ip);
}

export function hasRedisSecurityConfig() {
  return redis !== null;
}
