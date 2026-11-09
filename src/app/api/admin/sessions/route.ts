import { NextResponse } from "next/server";
import { authError, authRpc } from "@/lib/adminAuth";
import { requireAdmin } from "@/lib/adminSession";
import { hashToken } from "@/lib/password";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function bad(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

function sessionList(actorUserId: number, actorRole: string, tokenHash: string) {
  return authRpc("list_sessions", {
    actor_user_id: actorUserId,
    actor_role: actorRole,
    token_hash: tokenHash,
  });
}

export async function GET() {
  const ctx = await requireAdmin();
  if (!ctx) return bad("登录已失效，请重新登录", 401);
  try {
    const res = await sessionList(ctx.userId, ctx.role, hashToken(ctx.token));
    if (!res.ok) return bad(authError(res.error), 500);
    return NextResponse.json(
      {
        sessions: res.sessions ?? [],
        can_manage_all: ctx.role === "owner",
        me: { user_id: ctx.userId, username: ctx.username, role: ctx.role },
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (e) {
    console.error("[sessions] list", e);
    return bad("会话列表读取失败", 503);
  }
}

export async function POST(req: Request) {
  const ctx = await requireAdmin();
  if (!ctx) return bad("登录已失效，请重新登录", 401);

  let body: { action?: unknown; session_id?: unknown; scope?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return bad("请求格式不正确");
  }
  const action = String(body.action ?? "");
  const actor = { actor_user_id: ctx.userId, actor_role: ctx.role };

  try {
    if (action === "revoke") {
      const id = Number(body.session_id);
      if (!Number.isInteger(id) || id <= 0) return bad("缺少目标会话");
      // 非 owner 只能吊销自己的会话：先用同一套可见性规则确认目标。
      if (ctx.role !== "owner") {
        const visible = await sessionList(ctx.userId, ctx.role, hashToken(ctx.token));
        if (!visible.sessions?.some((s) => s.id === id)) {
          return bad("没有权限吊销该会话", 403);
        }
      }
      const res = await authRpc("revoke_session", { ...actor, session_id: id });
      if (!res.ok) return bad(authError(res.error));
      return NextResponse.json({ ok: true });
    }

    if (action === "revoke_all") {
      const scope = String(body.scope ?? "mine");
      if (scope === "all" && ctx.role !== "owner") {
        return bad("只有超级管理员可以吊销全部会话", 403);
      }
      const targets: number[] = [];
      if (scope === "all") {
        const users = await authRpc("list_users", actor);
        if (!users.ok) return bad(authError(users.error));
        targets.push(...(users.users ?? []).map((u) => u.id));
      } else {
        targets.push(ctx.userId);
      }
      for (const id of targets) {
        const res = await authRpc("revoke_user_sessions", { ...actor, user_id: id });
        if (!res.ok) return bad(authError(res.error));
      }
      // 当前会话可能也在被吊销范围内，前端据此提示重新登录。
      return NextResponse.json({ ok: true, relogin: true });
    }

    return bad("不支持的操作");
  } catch (e) {
    console.error("[sessions]", action, e);
    return bad("操作失败，请稍后重试", 503);
  }
}
