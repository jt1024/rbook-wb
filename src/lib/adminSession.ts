import "server-only";

import { cookies } from "next/headers";
import {
  authRpc,
  type AdminRole,
  type SessionContext,
} from "./adminAuth";
import { hashToken } from "./password";

// 会话改为服务端持久化：cookie 只保存随机 token，有效性以数据库记录为准。
// 因此停用账号、改密、手动吊销都能立即生效，不再需要轮换签名密钥。
export const SESSION_COOKIE = "rbook_admin";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 天

/**
 * 读取并校验当前会话。
 * 匿名请求（无 cookie）直接返回 null，不产生任何数据库调用，前台性能不受影响。
 */
export async function getSessionContext(): Promise<SessionContext | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const res = await authRpc("verify_session", { token_hash: hashToken(token) });
    if (!res.ok || !res.user_id || !res.role) return null;
    return {
      token,
      sessionId: Number(res.session_id),
      userId: Number(res.user_id),
      username: String(res.username ?? ""),
      displayName: String(res.display_name ?? ""),
      role: res.role as AdminRole,
    };
  } catch (e) {
    console.error("[auth] verify_session", e);
    return null;
  }
}

export async function setSessionCookie(token: string): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  });
}

export async function requireAdmin(): Promise<SessionContext | null> {
  return getSessionContext();
}

export async function requireOwner(): Promise<SessionContext | null> {
  const ctx = await getSessionContext();
  return ctx?.role === "owner" ? ctx : null;
}
