import { createHmac, timingSafeEqual } from "node:crypto";

// 后台会话：HMAC 签名的自包含 cookie，仅服务端读写。
// 无状态、无需会话表；过期时间由签名保护，篡改即失效。
export const SESSION_COOKIE = "rbook_admin";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 天

function signingKey(): string {
  return process.env.SESSION_SECRET ?? "";
}

function sign(payload: string): string {
  return createHmac("sha256", signingKey()).update(payload).digest("hex");
}

export function issueSession(): { token: string; maxAge: number } {
  const payload = Buffer.from(
    JSON.stringify({ exp: Date.now() + SESSION_MAX_AGE * 1000 })
  ).toString("base64url");
  return { token: `${payload}.${sign(payload)}`, maxAge: SESSION_MAX_AGE };
}

export function verifySession(token: string | undefined | null): boolean {
  if (!token || !signingKey()) return false;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return false;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = sign(payload);
  if (sig.length !== expected.length) return false;
  try {
    if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return false;
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return typeof decoded.exp === "number" && decoded.exp > Date.now();
  } catch {
    return false;
  }
}
