import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@lib/auth";

export async function POST() {
  const response = NextResponse.json({ success: true });
  response.cookies.set({ name: SESSION_COOKIE, value: "", maxAge: 0, httpOnly: true, path: "/" });
  return response;
}
