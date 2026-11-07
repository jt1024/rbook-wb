import "server-only";

import { cloud, safeQuery } from "./cloud";
import type { Audience, Interpretation, Style, Work } from "./types";

// ---------- 服务端直连数据库的查询 ----------
// 浏览器不再导入本模块：所有前台/后台读取统一经 /api/data 代理，
// 该路由会按登录态强制过滤未发布内容。

export async function listStyles(): Promise<Style[]> {
  const data = await safeQuery(() =>
    cloud.database.from("styles").select("*").order("sort_order")
  );
  return (data as Style[] | null) ?? [];
}

export async function listAudiences(): Promise<Audience[]> {
  const data = await safeQuery(() =>
    cloud.database.from("audiences").select("*").order("sort_order")
  );
  return (data as Audience[] | null) ?? [];
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
