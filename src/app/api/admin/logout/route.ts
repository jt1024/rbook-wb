import { NextResponse } from "next/server";
import { authRpc } from "@/lib/adminAuth";
import { clearSessionCookie, getSessionContext } from "@/lib/adminSession";
import { hashToken } from "@/lib/password";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const ctx = await getSessionContext();
  if (ctx) {
    // 服务端立即吊销：即便浏览器里的 cookie 被复制出去，也无法再使用。
    await authRpc("revoke_session", { token_hash: hashToken(ctx.token) }).catch(
      (e) => console.error("[auth] revoke_session", e)
    );
  }
  await clearSessionCookie();
  return NextResponse.json({ ok: true });
}
