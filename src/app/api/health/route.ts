import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { getDb } from "@infrastructure/db/client";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await getDb().execute(sql`select 1`);
    return NextResponse.json({ status: "ok", database: "ok" });
  } catch (error) {
    console.error("Health check failed", error);
    return NextResponse.json({ status: "error", database: "unavailable" }, { status: 503 });
  }
}
