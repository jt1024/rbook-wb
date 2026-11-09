import "server-only";

import {
  createHash,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
  type ScryptOptions,
} from "node:crypto";

// 密码哈希：scrypt(N=2^14, r=8, p=1) + 每账号独立随机盐。
// 存储格式 scrypt$N$r$p$salt$hash，全部使用 base64url，便于日后升级参数。
const N = 16384;
const R = 8;
const P = 1;
const KEY_LENGTH = 32;
const MAXMEM = 64 * 1024 * 1024;
const PREFIX = "scrypt";

function derive(
  password: string,
  salt: Buffer,
  keyLength: number,
  options: ScryptOptions
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, keyLength, options, (err, derived) => {
      if (err) reject(err);
      else resolve(derived);
    });
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt, KEY_LENGTH, { N, r: R, p: P, maxmem: MAXMEM });
  return [PREFIX, N, R, P, salt.toString("base64url"), key.toString("base64url")].join("$");
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  try {
    const [prefix, n, r, p, salt, hash] = stored.split("$");
    if (prefix !== PREFIX) return false;
    const expected = Buffer.from(hash, "base64url");
    if (!expected.length) return false;
    const key = await derive(password, Buffer.from(salt, "base64url"), expected.length, {
      N: Number(n),
      r: Number(r),
      p: Number(p),
      maxmem: MAXMEM,
    });
    return key.length === expected.length && timingSafeEqual(key, expected);
  } catch {
    return false;
  }
}

// 账号不存在时也做一次等价的 scrypt 运算，避免用响应时间枚举用户名。
let dummyHash: Promise<string> | null = null;
export async function burnPasswordCheck(password: string): Promise<void> {
  dummyHash ??= hashPassword("timing-equalizer-not-a-real-account");
  await verifyPassword(password, await dummyHash);
}

// 会话凭证：cookie 里放 256 位随机 token，数据库只存它的 SHA-256。
export function newSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
