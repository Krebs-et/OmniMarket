import { NextRequest, NextResponse } from "next/server";
import { checkApiRequest, isKnownApiPath, recordUnknownApiPath } from "./lib/security";

function makeNonce() {
  return btoa(crypto.randomUUID()).replace(/=/g, "");
}

function policy(nonce: string) {
  const developmentScript = process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : "";
  const developmentConnect = process.env.NODE_ENV === "development" ? " ws://localhost:* wss://localhost:*" : "";
  return [
    "default-src 'self'",
    "script-src 'self' 'nonce-" + nonce + "' 'strict-dynamic'" + developmentScript,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "img-src 'self' data: blob: https://lh3.googleusercontent.com https://avatars.githubusercontent.com",
    "font-src 'self' https://fonts.gstatic.com",
    "connect-src 'self' https://accounts.google.com https://github.com" + developmentConnect,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(process.env.NODE_ENV === "production" ? ["upgrade-insecure-requests"] : []),
  ].join("; ");
}

function logSecurityEvent(event: string, request: NextRequest, status: number, requestId: string) {
  console.warn(JSON.stringify({ level: "warn", event, status, method: request.method, path: request.nextUrl.pathname, requestId }));
}

function withSecurityHeaders(response: NextResponse, csp: string, requestId?: string) {
  if (requestId) response.headers.set("X-Request-Id", requestId);
  response.headers.set("Content-Security-Policy", csp);
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  return response;
}

export async function middleware(request: NextRequest) {
  const nonce = makeNonce();
  const requestId = request.headers.get("x-vercel-id") ?? crypto.randomUUID();
  const csp = policy(nonce);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-request-id", requestId);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const pathname = request.nextUrl.pathname;
  if (!pathname.startsWith("/api/") || pathname === "/api/health") {
    return withSecurityHeaders(NextResponse.next({ request: { headers: requestHeaders } }), csp, requestId);
  }

  if (!isKnownApiPath(pathname)) {
    try {
      await recordUnknownApiPath(request);
    } catch (error) {
      console.error("Failed to record suspicious API path", error);
      return withSecurityHeaders(NextResponse.json({ error: "Security service unavailable" }, { status: 503 }), csp, requestId);
    }
    logSecurityEvent("unknown_api_path", request, 404, requestId);
    return withSecurityHeaders(NextResponse.json({ error: "Not found" }, { status: 404 }), csp, requestId);
  }

  try {
    const result = await checkApiRequest(request);
    if (!result.allowed) {
      logSecurityEvent("api_request_rejected", request, result.status, requestId);
      const response = NextResponse.json({ error: result.error }, { status: result.status });
      if (result.status === 429) {
        response.headers.set("X-RateLimit-Limit", String(result.limit));
        response.headers.set("X-RateLimit-Remaining", String(result.remaining));
        response.headers.set("X-RateLimit-Reset", String(result.reset));
      }
      return withSecurityHeaders(response, csp, requestId);
    }

    const response = NextResponse.next({ request: { headers: requestHeaders } });
    if (result.limit !== null) {
      response.headers.set("X-RateLimit-Limit", String(result.limit));
      response.headers.set("X-RateLimit-Remaining", String(result.remaining));
      response.headers.set("X-RateLimit-Reset", String(result.reset));
    }
    return withSecurityHeaders(response, csp, requestId);
  } catch (error) {
    console.error("API security middleware failed", error);
    return withSecurityHeaders(NextResponse.json({ error: "Security service unavailable" }, { status: 503 }), csp, requestId);
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
