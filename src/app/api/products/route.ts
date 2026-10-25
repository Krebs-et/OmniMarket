import { NextResponse } from "next/server";
import { getProducts } from "@application/use-cases/get-products";
import { getSession } from "@lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await getSession())) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  return NextResponse.json(await getProducts());
}
