import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@lib/auth";
import { withApiObservability } from "@lib/api-observability";

async function logoutRoute(_request: Request) {
  const response = NextResponse.json({ success: true });
  response.cookies.set({ name: SESSION_COOKIE, value: "", maxAge: 0, httpOnly: true, path: "/" });
  return response;
}

export const POST = withApiObservability("POST", "/api/auth/logout", logoutRoute);
