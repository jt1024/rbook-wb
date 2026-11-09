import "server-only";

import { cloud } from "./cloud";

// 账号与会话数据只存在于云端 server-only 表中（RLS 开启、无策略、不授权给 anon）。
// 唯一入口是 SECURITY DEFINER 函数 public.admin_auth()，它校验服务端密钥并执行
// 白名单 action；浏览器无法直接读写这两张表，也无法绕过服务端自行调用。

export type AdminRole = "owner" | "admin" | "editor";

export const ROLE_LABELS: Record<AdminRole, string> = {
  owner: "超级管理员",
  admin: "管理员",
  editor: "编辑",
};

export interface AdminUser {
  id: number;
  username: string;
  display_name: string;
  role: AdminRole;
  is_active: boolean;
  failed_attempts: number;
  locked_until: string | null;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
  password_hash?: string;
}

export interface SessionRecord {
  id: number;
  user_id: number;
  username: string;
  created_at: string;
  expires_at: string;
  last_seen_at: string;
  revoked_at: string | null;
  ip: string;
  user_agent: string;
  current: boolean;
}

export interface SessionContext {
  token: string;
  sessionId: number;
  userId: number;
  username: string;
  displayName: string;
  role: AdminRole;
}

export interface AuthResult {
  ok: boolean;
  error?: string;
  user?: AdminUser;
  users?: AdminUser[];
  sessions?: SessionRecord[];
  session?: Record<string, unknown>;
  session_id?: number;
  user_id?: number;
  username?: string;
  display_name?: string;
  role?: AdminRole;
}

export async function authRpc(
  action: string,
  payload: Record<string, unknown> = {}
): Promise<AuthResult> {
  const secret = process.env.ADMIN_DB_SECRET;
  if (!secret) throw new Error("服务端未配置 ADMIN_DB_SECRET");
  const result = (await cloud.database.rpc("admin_auth", {
    p_secret: secret,
    p_action: action,
    p_payload: payload,
  })) as { data: AuthResult | string | null; error: { message?: string } | null };
  if (result.error) {
    throw new Error(result.error.message ?? "账号服务调用失败");
  }
  if (typeof result.data === "string") {
    return JSON.parse(result.data) as AuthResult;
  }
  return result.data ?? { ok: false, error: "empty_response" };
}

export function authError(code: string | undefined): string {
  const messages: Record<string, string> = {
    unauthorized: "账号服务鉴权失败，请检查服务端密钥配置",
    already_initialized: "账号已初始化",
    invalid_input: "输入格式不正确",
    invalid_session: "登录已失效",
    user_not_found: "账号不存在",
    username_taken: "用户名已被占用",
    invalid_role: "角色不合法",
    forbidden: "没有权限执行此操作",
    last_owner: "必须保留至少一个启用状态的超级管理员",
    cannot_disable_self: "不能停用自己的账号",
    cannot_delete_self: "不能删除自己的账号",
    unknown_action: "不支持的操作",
  };
  return messages[code ?? ""] ?? "操作失败，请重试";
}

export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return (fwd || req.headers.get("x-real-ip") || "").slice(0, 100);
}

export function userAgent(req: Request): string {
  return (req.headers.get("user-agent") || "").slice(0, 200);
}
