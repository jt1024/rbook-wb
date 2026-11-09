import "server-only";

// AI 路由统一鉴权：必须持有有效（且未被吊销）的后台数据库会话。
export { requireAdmin } from "./adminSession";

// 进程内滑动窗口限流。AI 路由本身已限定为登录管理员，
// 这里再加一层，防止脚本误触发/页面重复提交把额度打满。
const buckets = new Map<string, { count: number; reset: number }>();

export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const hit = buckets.get(key);
  if (!hit || now >= hit.reset) {
    buckets.set(key, { count: 1, reset: now + windowMs });
    return true;
  }
  if (hit.count >= limit) return false;
  hit.count += 1;
  return true;
}

export function clientKey(req: Request, scope: string): string {
  const fwd = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return `${scope}:${fwd || req.headers.get("x-real-ip") || "local"}`;
}
