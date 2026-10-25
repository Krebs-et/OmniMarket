import { NextResponse } from "next/server";
import { DEMO_ACCOUNTS } from "@application/use-cases/resolve-role";
import { createSession, sessionCookie } from "@lib/auth";
import { recordAuthenticationFailure } from "@lib/security";
import { withApiObservability } from "@lib/api-observability";

async function demoLoginRoute(request: Request) {
  if (process.env.NODE_ENV === "production" || process.env.APP_ENV === "production") {
    return NextResponse.json({ error: "Demo login is only available in development" }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  const expectedPassword = process.env.DEMO_PASSWORD ?? "omnimarket";
  const allowedEmails = [(process.env.DEMO_EMAIL ?? "demo@omnimarket.local").toLowerCase(), ...Object.keys(DEMO_ACCOUNTS)];

  if (!allowedEmails.includes(email) || password !== expectedPassword) {
    await recordAuthenticationFailure(request);
    return NextResponse.json({ error: "Correo o contraseña incorrectos" }, { status: 401 });
  }

  const response = NextResponse.json({ email });
  response.cookies.set(sessionCookie(createSession(email)));
  return response;
}

export const POST = withApiObservability("POST", "/api/auth/login", demoLoginRoute);
