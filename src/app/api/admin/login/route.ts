import { NextResponse } from "next/server";
import {
  normalizePassword,
  normalizeUsername,
  USERNAME_RE,
} from "@/lib/accountValidation";
import { authError, authRpc, clientIp, userAgent } from "@/lib/adminAuth";
import { SESSION_MAX_AGE, setSessionCookie } from "@/lib/adminSession";
import { burnPasswordCheck, hashPassword, hashToken, newSessionToken, verifyPassword } from "@/lib/password";
import { clientKey, rateLimit } from "@/lib/aiGuard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface LoginUser {
  id: number;
  username: string;
  display_name: string;
  role: string;
  password_hash: string;
  is_active: boolean;
  locked_until: string | null;
}

// 首次部署时把 .env.local 里的初始口令迁移为数据库里的第一个 owner。
// 云端函数保证「表内已有账号即拒绝」，且调用需要服务端私有密钥，因此
// 这不是一个公开注册入口；进程内只尝试一次。
let bootstrapDone = false;
async function ensureBootstrap(): Promise<void> {
  if (bootstrapDone) return;
  const password = process.env.ADMIN_PASSWORD;
  const username = (process.env.ADMIN_USERNAME || "admin").toLowerCase();
  if (!password || !USERNAME_RE.test(username)) {
    bootstrapDone = true; // 未配置初始口令：跳过，等待管理员手工建号
    return;
  }
  try {
    const res = await authRpc("bootstrap", {
      username,
      password_hash: await hashPassword(password),
      display_name: "站点管理员",
    });
    if (res.ok || res.error === "already_initialized") bootstrapDone = true;
  } catch (e) {
    console.error("[auth] bootstrap", e);
  }
}

function fail(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(req: Request) {
  if (!rateLimit(clientKey(req, "admin-login"), 10, 15 * 60_000)) {
    return fail("尝试次数过多，请 15 分钟后重试", 429);
  }

  let username = "";
  let password = "";
  try {
    const body = (await req.json()) as { username?: unknown; password?: unknown };
    username = normalizeUsername(body.username);
    password = normalizePassword(body.password);
  } catch {
    return fail("请求格式不正确", 400);
  }
  if (!USERNAME_RE.test(username) || !password) {
    return fail("请输入用户名和密码", 400);
  }

  await ensureBootstrap();

  let user: LoginUser | null = null;
  try {
    const res = await authRpc("get_user", { username });
    user = (res.ok && res.user ? res.user : null) as unknown as LoginUser | null;
  } catch (e) {
    console.error("[auth] get_user", e);
    return fail("账号服务暂不可用，请稍后重试", 503);
  }

  // 账号不存在时也做一次等价的 scrypt 运算，避免通过响应时间枚举用户名。
  if (!user?.password_hash) {
    await burnPasswordCheck(password);
    return fail("用户名或密码不正确", 401);
  }

  if (user.locked_until && new Date(user.locked_until).getTime() > Date.now()) {
    return fail("账号已被临时锁定，请 15 分钟后再试", 423);
  }

  const matched = await verifyPassword(password, user.password_hash);
  if (!matched) {
    await authRpc("login_result", { user_id: user.id, success: false }).catch(() => {});
    return fail("用户名或密码不正确", 401);
  }
  if (!user.is_active) {
    return fail("该账号已停用，请联系超级管理员", 403);
  }

  // 校验通过：清零失败计数并签发一条可吊销的数据库会话。
  await authRpc("login_result", { user_id: user.id, success: true }).catch(() => {});
  const token = newSessionToken();
  try {
    const created = await authRpc("create_session", {
      user_id: user.id,
      token_hash: hashToken(token),
      expires_at: new Date(Date.now() + SESSION_MAX_AGE * 1000).toISOString(),
      ip: clientIp(req),
      user_agent: userAgent(req),
    });
    if (!created.ok) return fail(authError(created.error), 500);
  } catch (e) {
    console.error("[auth] create_session", e);
    return fail("会话创建失败，请稍后重试", 503);
  }

  await setSessionCookie(token);
  return NextResponse.json({
    ok: true,
    user: {
      username: user.username,
      display_name: user.display_name,
      role: user.role,
    },
  });
}
