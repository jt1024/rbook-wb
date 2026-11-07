// 浏览器侧数据访问层：所有读取统一走本站 /api/data 代理。
// 云 SDK、endpoint 与 publishableKey 都只存在于服务端，前端 bundle 不再包含它们。

import type { Audience, Interpretation, Style, Work } from "./types";

async function call<T>(op: string, args: unknown): Promise<T> {
  const res = await fetch("/api/data", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ op, args }),
    cache: "no-store",
  });
  if (!res.ok) {
    let message = `请求失败（HTTP ${res.status}）`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      // 忽略非 JSON 响应
    }
    throw new Error(message);
  }
  const json = (await res.json()) as { data?: T; error?: string };
  if (json.error) throw new Error(json.error);
  return json.data as T;
}

// 与旧版 safeQuery 一致的优雅降级：出错时返回空值，不中断页面渲染。
async function safeCall<T>(op: string, args: unknown, fallback: T): Promise<T> {
  try {
    return await call<T>(op, args);
  } catch (e) {
    console.error("[api]", op, e);
    return fallback;
  }
}

export async function listStyles(): Promise<Style[]> {
  return safeCall<Style[]>("listStyles", {}, []);
}

export async function listAudiences(): Promise<Audience[]> {
  return safeCall<Audience[]>("listAudiences", {}, []);
}

export async function listWorks(opts?: {
  status?: string;
  category?: string;
  q?: string;
  limit?: number;
}): Promise<Work[]> {
  return safeCall<Work[]>("listWorks", opts ?? {}, []);
}

export async function getWorkBySlug(slug: string): Promise<Work | null> {
  return safeCall<Work | null>("getWorkBySlug", { slug }, null);
}

export async function getWorkById(id: number): Promise<Work | null> {
  return safeCall<Work | null>("getWorkById", { id }, null);
}

export async function listInterpretations(opts?: {
  workId?: number;
  styleId?: number;
  audienceId?: number;
  status?: string;
}): Promise<Interpretation[]> {
  return safeCall<Interpretation[]>("listInterpretations", opts ?? {}, []);
}

export async function getInterpretationById(
  id: number
): Promise<Interpretation | null> {
  return safeCall<Interpretation | null>("getInterpretationById", { id }, null);
}

export async function listGenerationJobs(limit = 20) {
  return safeCall<Array<Record<string, unknown>>>(
    "listGenerationJobs",
    { limit },
    []
  );
}

// 生成 slug：中文标题转拼音不可用时退化为时间戳 + 随机
export function makeSlug(title: string): string {
  const ascii = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  const base = ascii.length >= 2 ? ascii : "w";
  return `${base}-${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;
}
