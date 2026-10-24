import { NextResponse } from "next/server";
import { createSession, sessionCookie } from "@lib/auth";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  const expectedEmail = (process.env.DEMO_EMAIL ?? (process.env.NODE_ENV === "production" ? "" : "demo@omnimarket.local")).toLowerCase();
  const expectedPassword = process.env.DEMO_PASSWORD ?? (process.env.NODE_ENV === "production" ? "" : "omnimarket");

  if (email !== expectedEmail || password !== expectedPassword) {
    return NextResponse.json({ error: "Correo o contraseña incorrectos" }, { status: 401 });
  }

  const response = NextResponse.json({ email });
  response.cookies.set(sessionCookie(createSession(email)));
  return response;
}
