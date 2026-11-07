import "server-only";

import fs from "node:fs";
import path from "node:path";
import { cloud } from "./cloud";
import { listModels } from "./ai";

// 作品元数据 + 全文检索。原本跑在浏览器里，会直接消耗 LLM 网关额度；
// 现在全部在服务端执行，并保留「按历史命中率串行级联 + 结果缓存」的成本优化。
// 统计与缓存放在进程内存中：多用户共享、不随浏览器清理而丢失；
// 服务重启会重置（冷启动自动回到中性排序），属于可接受的降级。

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

interface OLDoc {
  title?: string;
  author_name?: string[];
  first_publish_year?: number;
  first_sentence?: string[];
}

const MAX_MODELS = 4;
const MAX_ANSWER_CHARS = 30000;
const CACHE_MAX = 300;

// 冷启动顺序：先试免费 / flash 便宜模型，最后才升级到「愿意输出全文」的贵模型。
// 一旦积累了成功率统计，就完全由统计分排序，这里只影响全新的部署。
const SEED_ORDER = ["hy4free", "glm-5.3-flash", "deepseek-v4-flash", "kimi-k3.1-pro"];
const STATE_FILE = path.join(process.cwd(), ".data", "ai-search-state.json");

const stats = new Map<string, { ok: number; total: number }>();
const cache = new Map<string, { ts: number; meta: MetaResult }>();
let stateLoaded = false;

function loadState(): void {
  if (stateLoaded) return;
  stateLoaded = true;
  try {
    const saved = JSON.parse(fs.readFileSync(STATE_FILE, "utf8")) as {
      stats?: Record<string, { ok: number; total: number }>;
      cache?: Record<string, { ts: number; meta: MetaResult }>;
    };
    for (const [k, v] of Object.entries(saved.stats ?? {})) stats.set(k, v);
    for (const [k, v] of Object.entries(saved.cache ?? {})) cache.set(k, v);
  } catch {
    // 首次运行或只读文件系统：退回纯内存模式
  }
}

function persistState(): void {
  try {
    fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
    fs.writeFileSync(
      STATE_FILE,
      JSON.stringify({
        stats: Object.fromEntries(stats),
        cache: Object.fromEntries(cache),
      })
    );
  } catch {
    // 部署环境只读时静默降级，不影响检索
  }
}

function modelScore(id: string): number {
  const s = stats.get(id);
  if (!s) {
    const seed = SEED_ORDER.indexOf(id);
    return seed >= 0 ? 0.5 + (SEED_ORDER.length - seed) * 0.01 : 0.5;
  }
  return (s.ok + 1) / (s.total + 2); // 拉普拉斯平滑
}

function recordAttempt(id: string, gotContent: boolean) {
  loadState();
  const s = stats.get(id) ?? { ok: 0, total: 0 };
  s.total += 1;
  if (gotContent) s.ok += 1;
  stats.set(id, s);
  persistState();
}

function loadCache(title: string): MetaResult | null {
  loadState();
  const hit = cache.get(title);
  if (!hit) return null;
  // 有全文缓存 7 天；仅元数据缓存 1 小时（允许稍后重试补全文）
  const ttl = hit.meta.content ? 7 * 864e5 : 36e5;
  if (Date.now() - hit.ts >= ttl) {
    cache.delete(title);
    return null;
  }
  return hit.meta;
}

function saveCache(title: string, meta: MetaResult) {
  loadState();
  if (cache.size >= CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
  cache.set(title, { ts: Date.now(), meta });
  persistState();
}

// 严格 JSON 解析失败时的容错提取（长全文输出下模型偶发格式破损/截断）
function parseMeta(raw: string): MetaResult | null {
  const unescape = (s: string) =>
    s.replace(/\\n/g, "\n").replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  try {
    return JSON.parse(raw) as MetaResult;
  } catch {
    const grabShort = (key: string) => {
      const m = raw.match(new RegExp(`"${key}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`));
      return m ? unescape(m[1]).trim() : undefined;
    };
    const grabContent = () => {
      const m = raw.match(/"content"\s*:\s*"([\s\S]*)/);
      if (!m) return undefined;
      return unescape(m[1].replace(/"\s*,?\s*}\s*$/, "")).trim() || undefined;
    };
    return {
      author: grabShort("author"),
      era: grabShort("era"),
      intro: grabShort("intro"),
      category: grabShort("category"),
      content: grabContent(),
    };
  }
}

async function queryLLMOnce(modelId: string, title: string): Promise<MetaResult | null> {
  let answer = "";
  for await (const chunk of cloud.llm.chat.completions.create({
    model: modelId,
    messages: [
      {
        role: "system",
        content:
          "你是严谨的图书资料员，正在为一个仅供学习交流、已统一附版权声明的非营利阅读站整理公有资料。根据作品名检索其元数据；只依据确凿的常识作答，不确定的字段留空字符串。只输出 JSON，不要输出任何其他文字。",
      },
      {
        role: "user",
        content: `请检索作品《${title}》的元数据，输出 JSON 对象，字段：\n{"author":"作者中文译名或原名","era":"创作年代或作者所处年代，如 1926 / 清代 / 古希腊","intro":"50-120字的作品简介","category":"从这些选项里选一个最贴切的：中国现代散文 / 公版古文 / 外国经典 / 儿童经典 / 其他","content":"原文全文"}\n\ncontent 字段规则：只要你确实记得该作品的原文，就输出完整全文，保持自然段落，段落之间用两个换行符分隔，不要添加任何标题、注释或改写；只要有一丝不确定（记忆模糊、可能拼凑），就输出空字符串。宁缺毋错，绝不编造。`,
      },
    ] as unknown as Array<{ role: "system" | "user"; content: string }>,
    stream: true,
    temperature: 0.3,
  })) {
    const delta = chunk.choices[0]?.delta;
    if (delta?.content) answer += delta.content;
    if (answer.length > MAX_ANSWER_CHARS) break;
  }
  const raw = answer.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1) return null;
  return parseMeta(raw.slice(start, end + 1));
}

async function searchOpenLibrary(title: string): Promise<MetaResult | null> {
  try {
    const res = await fetch(
      `https://openlibrary.org/search.json?q=${encodeURIComponent(title)}&limit=5&fields=title,author_name,first_publish_year,first_sentence`,
      { signal: AbortSignal.timeout(8000) }
    );
    const json = (await res.json()) as { docs?: OLDoc[] };
    const doc = json.docs?.[0];
    if (!doc) return null;
    return {
      author: doc.author_name?.[0],
      era: doc.first_publish_year ? String(doc.first_publish_year) : undefined,
      intro: doc.first_sentence?.[0],
    };
  } catch {
    return null;
  }
}

export async function searchWorkMeta(title: string): Promise<SearchOutcome> {
  const cached = loadCache(title);
  if (cached) return { meta: cached, source: "cache", modelsTried: 0 };

  let modelsTried = 0;
  try {
    const ms = await listModels();
    const chatModels = (ms as Array<{ id: string; disabled?: boolean }>)
      .filter((m) => m.disabled !== true && !/image|video|audio|tts|asr/i.test(m.id))
      .map((m) => m.id);
    const ordered = [...chatModels]
      .sort((a, b) => modelScore(b) - modelScore(a) || a.localeCompare(b))
      .slice(0, MAX_MODELS);

    const clean = (v: unknown) =>
      typeof v === "string" && v.trim() && v.trim() !== "无" ? v.trim() : undefined;
    const merged: MetaResult = {};
    for (const id of ordered) {
      modelsTried += 1;
      let r: MetaResult | null = null;
      try {
        r = await queryLLMOnce(id, title);
      } catch {
        r = null;
      }
      recordAttempt(id, Boolean(r?.content));
      for (const k of ["author", "era", "intro", "category", "content"] as const) {
        const v = clean(r?.[k]);
        if (v && !merged[k]) merged[k] = v;
      }
      if (merged.content) break; // 命中全文即停，稳态只花 1 次调用
    }
    if (merged.author || merged.era || merged.intro || merged.content) {
      saveCache(title, merged);
      return { meta: merged, source: "llm", modelsTried };
    }
  } catch (e) {
    console.error("[ai/search] LLM 检索失败", e);
  }

  const fallback = await searchOpenLibrary(title);
  if (fallback) {
    saveCache(title, fallback);
    return { meta: fallback, source: "openlibrary", modelsTried };
  }
  return { meta: null, source: "none", modelsTried };
}
