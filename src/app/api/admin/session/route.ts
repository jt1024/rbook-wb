import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/adminSession";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const store = await cookies();
  const ok = verifySession(store.get(SESSION_COOKIE)?.value);
  return NextResponse.json({ ok });
}
