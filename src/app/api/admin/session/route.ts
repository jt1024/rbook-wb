import { NextResponse } from "next/server";
import { getSessionContext } from "@/lib/adminSession";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const ctx = await getSessionContext();
  return NextResponse.json(
    {
      ok: Boolean(ctx),
      user: ctx
        ? {
            user_id: ctx.userId,
            username: ctx.username,
            display_name: ctx.displayName,
            role: ctx.role,
          }
        : null,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
