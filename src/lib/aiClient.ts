// 浏览器侧 AI 客户端：所有能力都经本站 /api/ai/* 代理，
// 需要后台会话 cookie 才能调用。前端不再导入云 SDK，也不再持有模型网关地址。

import type { Audience, InterpretationContent, Style, Work } from "./types";

export interface ModelItem {
  id: string;
  name?: string;
  disabled?: boolean;
}

export interface GenerationResult {
  content: string;
  parsed: InterpretationContent;
  score: number;
  issues: string[];
  model: string;
}

export interface MetaResult {
  author?: string;
  era?: string;
  intro?: string;
  category?: string;
  content?: string;
}

export interface SearchOutcome {
  meta: MetaResult | null;
  source: "cache" | "llm" | "openlibrary" | "none";
  modelsTried: number;
}

async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as { error?: string } & T;
  if (!res.ok || json.error) {
    throw new Error(json.error ?? `请求失败（HTTP ${res.status}）`);
  }
  return json as T;
}

export async function listModels(): Promise<ModelItem[]> {
  const res = await fetch("/api/ai/models", { cache: "no-store" });
  const json = (await res.json().catch(() => ({}))) as {
    models?: ModelItem[];
    error?: string;
  };
  if (!res.ok || json.error) {
    throw new Error(json.error ?? `模型列表获取失败（HTTP ${res.status}）`);
  }
  return json.models ?? [];
}

export async function generateInterpretation(
  work: Work,
  style: Style,
  audience: Audience,
  modelId: string
): Promise<GenerationResult> {
  return post<GenerationResult>("/api/ai/generate", {
    work,
    style,
    audience,
    modelId,
  });
}

export async function searchWorkMeta(title: string): Promise<SearchOutcome> {
  return post<SearchOutcome>("/api/ai/search", { title });
}
