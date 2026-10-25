import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { auth } from "../../auth";

const SESSION_COOKIE = "omnimarket_session";
const SESSION_TTL_SECONDS = 60 * 60 * 8;

function secret() {
  const value = process.env.AUTH_SECRET;
  if (value) return value;
  if (process.env.NODE_ENV === "production") {
    throw new Error("AUTH_SECRET is required in production");
  }
  return "local-mvp-secret-change-me";
}

function signature(value: string) {
  return createHmac("sha256", secret()).update(value).digest("hex");
}

export function createSession(email: string) {
  const value = Buffer.from(JSON.stringify({ email, exp: Date.now() + SESSION_TTL_SECONDS * 1000 })).toString("base64url");
  return value + "." + signature(value);
}

export function verifySession(token: string | undefined) {
  if (process.env.NODE_ENV === "production" || !token) return null;
  const [value, providedSignature] = token.split(".");
  if (!value || !providedSignature) return null;

  const expectedSignature = signature(value);
  const isValid = providedSignature.length === expectedSignature.length &&
    timingSafeEqual(Buffer.from(providedSignature), Buffer.from(expectedSignature));
  if (!isValid) return null;

  try {
    const session = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as { email: string; exp: number };
    return session.exp > Date.now() ? session : null;
  } catch {
    return null;
  }
}

export async function getSession() {
  const oauthSession = await auth();
  if (oauthSession?.user?.email) return { email: oauthSession.user.email };
  if (process.env.NODE_ENV === "production" || process.env.APP_ENV === "production") return null;
  return verifySession((await cookies()).get(SESSION_COOKIE)?.value);
}

export function sessionCookie(token: string) {
  return {
    name: SESSION_COOKIE,
    value: token,
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_TTL_SECONDS,
    path: "/",
  };
}

export { SESSION_COOKIE };
