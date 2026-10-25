import { NextResponse } from "next/server";
import { getAnalytics } from "@application/use-cases/get-analytics";
import { getSession } from "@lib/auth";
import { recordAuthenticationFailure } from "@lib/security";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!(await getSession())) {
    await recordAuthenticationFailure(request);
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
  return NextResponse.json(await getAnalytics());
}
