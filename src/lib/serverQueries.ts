import "server-only";

import { cloud, safeQuery } from "./cloud";
import type { Audience, Interpretation, Style, Work } from "./types";

// ---------- 服务端直连数据库的查询 ----------
// 浏览器不再导入本模块：所有前台/后台读取统一经 /api/data 代理，
// 该路由会按登录态强制过滤未发布内容。

// 公开查询默认只返回启用且未删除的风格/人群；
// 后台字典管理用 includeInactive 拿全量（仍不含已删除）。
export async function listStyles(opts?: {
  includeInactive?: boolean;
}): Promise<Style[]> {
  let q = cloud.database.from("styles").select("*");
  if (!opts?.includeInactive) {
    q = q.eq("is_active", true).is("deleted_at", null);
  } else {
    q = q.is("deleted_at", null);
  }
  const data = await safeQuery(() => q.order("sort_order"));
  return (data as Style[] | null) ?? [];
}

export async function listAudiences(opts?: {
  includeInactive?: boolean;
}): Promise<Audience[]> {
  let q = cloud.database.from("audiences").select("*");
  if (!opts?.includeInactive) {
    q = q.eq("is_active", true).is("deleted_at", null);
  } else {
    q = q.is("deleted_at", null);
  }
  const data = await safeQuery(() => q.order("sort_order"));
  return (data as Audience[] | null) ?? [];
}

// 字典管理页展示各风格/人群的关联解读数（影响面可见）
export async function countInterpretationsByDict(): Promise<{
  styles: Record<number, number>;
  audiences: Record<number, number>;
}> {
  const data = await safeQuery(() =>
    cloud.database.from("interpretations").select("style_id,audience_id")
  );
  const result = { styles: {}, audiences: {} } as {
    styles: Record<number, number>;
    audiences: Record<number, number>;
  };
  for (const row of (data as Array<{ style_id: number; audience_id: number }> | null) ?? []) {
    result.styles[row.style_id] = (result.styles[row.style_id] ?? 0) + 1;
    result.audiences[row.audience_id] = (result.audiences[row.audience_id] ?? 0) + 1;
  }
  return result;
}

export async function listWorks(opts?: {
  status?: string;
  category?: string;
  q?: string;
  limit?: number;
}): Promise<Work[]> {
  let q = cloud.database.from("works").select("*");
  if (opts?.status) q = q.eq("status", opts.status);
  if (opts?.category) q = q.eq("category", opts.category);
  if (opts?.q) q = q.or(`title.ilike.%${opts.q}%,author.ilike.%${opts.q}%`);
  q = q.order("created_at", { ascending: false });
  if (opts?.limit) q = q.limit(opts.limit);
  const data = await safeQuery(() => q);
  return (data as Work[] | null) ?? [];
}

export async function getWorkBySlug(slug: string): Promise<Work | null> {
  const data = await safeQuery(() =>
    cloud.database.from("works").select("*").eq("slug", slug).maybeSingle()
  );
  return (data as Work | null) ?? null;
}

export async function getWorkById(id: number): Promise<Work | null> {
  const data = await safeQuery(() =>
    cloud.database.from("works").select("*").eq("id", id).maybeSingle()
  );
  return (data as Work | null) ?? null;
}

export async function listInterpretations(opts?: {
  workId?: number;
  styleId?: number;
  audienceId?: number;
  status?: string;
}): Promise<Interpretation[]> {
  let q = cloud.database.from("interpretations").select("*");
  if (opts?.workId) q = q.eq("work_id", opts.workId);
  if (opts?.styleId) q = q.eq("style_id", opts.styleId);
  if (opts?.audienceId) q = q.eq("audience_id", opts.audienceId);
  if (opts?.status) q = q.eq("status", opts.status);
  q = q.order("created_at", { ascending: false });
  const data = await safeQuery(() => q);
  return (data as Interpretation[] | null) ?? [];
}

export async function getInterpretationById(
  id: number
): Promise<Interpretation | null> {
  const data = await safeQuery(() =>
    cloud.database
      .from("interpretations")
      .select("*")
      .eq("id", id)
      .maybeSingle()
  );
  return (data as Interpretation | null) ?? null;
}

export async function listGenerationJobs(limit = 20) {
  const data = await safeQuery(() =>
    cloud.database
      .from("generation_jobs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit)
  );
  return (data as Array<Record<string, unknown>> | null) ?? [];
}
