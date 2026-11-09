import { NextResponse } from "next/server";
import {
  authError,
  authRpc,
  type AdminRole,
} from "@/lib/adminAuth";
import { clearSessionCookie, requireAdmin, requireOwner } from "@/lib/adminSession";
import {
  MIN_PASSWORD_LENGTH,
  normalizeDisplayName,
  normalizePassword,
  normalizeUsername,
  ROLES,
  USERNAME_RE,
  validPassword,
} from "@/lib/accountValidation";
import { hashPassword, verifyPassword } from "@/lib/password";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface AccountRequest {
  action?: unknown;
  username?: unknown;
  password?: unknown;
  old_password?: unknown;
  new_password?: unknown;
  display_name?: unknown;
  role?: unknown;
  is_active?: unknown;
  user_id?: unknown;
}

function bad(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

function targetId(value: unknown): number {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : 0;
}

export async function GET() {
  const ctx = await requireAdmin();
  if (!ctx) return bad("登录已失效，请重新登录", 401);
  let users: unknown[] = [];
  if (ctx.role === "owner") {
    try {
      const res = await authRpc("list_users", { actor_role: ctx.role });
      if (!res.ok) return bad(authError(res.error), 500);
      users = res.users ?? [];
    } catch (e) {
      console.error("[accounts] list_users", e);
      return bad("账号列表读取失败", 503);
    }
  }
  return NextResponse.json(
    {
      users,
      me: {
        user_id: ctx.userId,
        username: ctx.username,
        display_name: ctx.displayName,
        role: ctx.role,
      },
      can_manage_users: ctx.role === "owner",
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}

export async function POST(req: Request) {
  const ctx = await requireAdmin();
  if (!ctx) return bad("登录已失效，请重新登录", 401);

  let body: AccountRequest;
  try {
    body = (await req.json()) as AccountRequest;
  } catch {
    return bad("请求格式不正确");
  }
  const action = String(body.action ?? "");

  // 本人修改自己的密码：任何角色都允许，但必须校验旧密码。
  if (action === "change_password") {
    const oldPassword = normalizePassword(body.old_password);
    const newPassword = normalizePassword(body.new_password);
    if (!validPassword(newPassword)) {
      return bad(`新密码至少 ${MIN_PASSWORD_LENGTH} 位`);
    }
    try {
      const found = await authRpc("get_user", { username: ctx.username });
      if (!found.ok || !found.user?.password_hash) return bad("账号不存在", 404);
      if (!(await verifyPassword(oldPassword, found.user.password_hash))) {
        return bad("原密码不正确", 401);
      }
      const res = await authRpc("set_password", {
        user_id: ctx.userId,
        password_hash: await hashPassword(newPassword),
        actor_user_id: ctx.userId,
        actor_role: ctx.role,
      });
      if (!res.ok) return bad(authError(res.error));
      // 改密会吊销该账号的全部会话（含当前），这里同步清掉 cookie。
      await clearSessionCookie();
      return NextResponse.json({ ok: true, relogin: true });
    } catch (e) {
      console.error("[accounts] change_password", e);
      return bad("密码修改失败，请稍后重试", 503);
    }
  }

  // 以下操作仅超级管理员可用。
  const owner = await requireOwner();
  if (!owner) return bad("只有超级管理员可以管理账号", 403);

  const actor = { actor_user_id: owner.userId, actor_role: owner.role };
  try {
    if (action === "create") {
      const username = normalizeUsername(body.username);
      const password = normalizePassword(body.password);
      const role = String(body.role ?? "editor") as AdminRole;
      if (!USERNAME_RE.test(username)) return bad("用户名需为 3–40 位小写字母、数字或 . _ -");
      if (!validPassword(password)) return bad("密码需为 10–128 位");
      if (!ROLES.includes(role)) return bad("角色不合法");
      const res = await authRpc("create_user", {
        ...actor,
        username,
        password_hash: await hashPassword(password),
        display_name: normalizeDisplayName(body.display_name) || username,
        role,
      });
      if (!res.ok) return bad(authError(res.error));
      return NextResponse.json({ ok: true });
    }

    if (action === "update") {
      const id = targetId(body.user_id);
      if (!id) return bad("缺少目标账号");
      const payload: Record<string, unknown> = { ...actor, user_id: id };
      if (body.display_name !== undefined) {
        payload.display_name = normalizeDisplayName(body.display_name);
      }
      if (body.role !== undefined) {
        const role = String(body.role);
        if (!ROLES.includes(role as AdminRole)) return bad("角色不合法");
        payload.role = role;
      }
      if (body.is_active !== undefined) {
        payload.is_active = body.is_active === true ? "true" : "false";
      }
      const res = await authRpc("update_user", payload);
      if (!res.ok) return bad(authError(res.error));
      return NextResponse.json({ ok: true });
    }

    if (action === "set_password") {
      const id = targetId(body.user_id);
      const password = normalizePassword(body.password);
      if (!id) return bad("缺少目标账号");
      if (!validPassword(password)) return bad("密码需为 10–128 位");
      const res = await authRpc("set_password", {
        ...actor,
        user_id: id,
        password_hash: await hashPassword(password),
      });
      if (!res.ok) return bad(authError(res.error));
      return NextResponse.json({ ok: true });
    }

    if (action === "delete") {
      const id = targetId(body.user_id);
      if (!id) return bad("缺少目标账号");
      const res = await authRpc("delete_user", { ...actor, user_id: id });
      if (!res.ok) return bad(authError(res.error));
      return NextResponse.json({ ok: true });
    }

    return bad("不支持的操作");
  } catch (e) {
    console.error("[accounts]", action, e);
    return bad("操作失败，请稍后重试", 503);
  }
}
