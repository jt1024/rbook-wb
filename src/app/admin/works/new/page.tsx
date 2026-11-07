"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { cloud } from "@/lib/cloud";
import { adminWrite } from "@/lib/adminDb";
import { listModels } from "@/lib/ai";
import { makeSlug } from "@/lib/queries";

const CATEGORIES = ["中国现代散文", "公版古文", "外国经典", "儿童经典", "其他"];

interface OLDoc {
  title?: string;
  author_name?: string[];
  first_publish_year?: number;
  first_sentence?: string[];
}

interface MetaResult {
  author?: string;
  era?: string;
  intro?: string;
  category?: string;
  content?: string;
}

// OpenLibrary 公开书目检索（对英文/外国作品较全；对中文作品几乎查不到，
// 且部分网络环境不可达 —— 仅作兜底，必须带超时避免长时间等待）。
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

// LLM 元数据检索（主源）：经典作品（尤其中文散文/古文）属于常识范畴，
// 模型可直接给出作者、年代、简介与分类建议，成功率和中文命中率远高于英文书目库。
// 严格 JSON 解析失败时的容错提取（长全文输出下模型偶发格式破损/截断）
function parseMeta(raw: string): MetaResult | null {
  const unescape = (s: string) =>
    s.replace(/\\n/g, "\n").replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  try {
    return JSON.parse(raw) as MetaResult;
  } catch {
    // 短字段：完整的 JSON 字符串值（处理转义）
    const grabShort = (key: string) => {
      const m = raw.match(new RegExp(`"${key}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`));
      return m ? unescape(m[1]).trim() : undefined;
    };
    // content：从 "content":" 开始取到结尾（容忍尾部截断），去掉收尾的 "} 与空白
    const grabContent = () => {
      const m = raw.match(/"content"\s*:\s*"([\s\S]*)/);
      if (!m) return undefined;
      return unescape(m[1].replace(/"\s*,?\s*}\s*$/, "")).trim() || undefined;
    };
    const out: MetaResult = {
      author: grabShort("author"),
      era: grabShort("era"),
      intro: grabShort("intro"),
      category: grabShort("category"),
      content: grabContent(),
    };
    return out;
  }
}

// 单次 LLM 查询：返回元数据（可能不含全文）
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
  }
  // 兼容模型可能包裹的 ```json 代码块
  const raw = answer.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1) return null;
  return parseMeta(raw.slice(start, end + 1));
}

// ===== 成本优化：模型成功率记忆 + 结果缓存（localStorage 持久化） =====
// 策略：串行级联替代并发 —— 按历史「全文命中率」排序逐个尝试，命中即停。
// 稳态下大多数检索只花 1 次调用的钱；失败才升级到下一个模型。
const STATS_KEY = "ci-model-stats";
const CACHE_PREFIX = "ci-meta-cache:";

type ModelStats = Record<string, { ok: number; total: number }>;

function loadModelStats(): ModelStats {
  try {
    return JSON.parse(localStorage.getItem(STATS_KEY) ?? "{}") as ModelStats;
  } catch {
    return {};
  }
}

// 拉普拉斯平滑评分：(成功+1)/(总次数+2)，冷启动模型天然排在已知失败者前面
function modelScore(stats: ModelStats, id: string): number {
  const s = stats[id];
  if (!s) return 0.5; // 未尝试过的模型给中性分
  return (s.ok + 1) / (s.total + 2);
}

function recordAttempt(stats: ModelStats, id: string, gotContent: boolean) {
  const s = stats[id] ?? { ok: 0, total: 0 };
  s.total += 1;
  if (gotContent) s.ok += 1;
  stats[id] = s;
  localStorage.setItem(STATS_KEY, JSON.stringify(stats));
}

function loadCache(title: string): MetaResult | null {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + title);
    if (!raw) return null;
    const { ts, meta } = JSON.parse(raw) as { ts: number; meta: MetaResult };
    // 有全文缓存 7 天；仅元数据缓存 1 小时（模型行为会变，允许稍后重试补全文）
    const ttl = meta.content ? 7 * 864e5 : 36e5;
    return Date.now() - ts < ttl ? meta : null;
  } catch {
    return null;
  }
}

function saveCache(title: string, meta: MetaResult) {
  try {
    localStorage.setItem(CACHE_PREFIX + title, JSON.stringify({ ts: Date.now(), meta }));
  } catch {
    // localStorage 满或不可用时静默降级
  }
}

// LLM 元数据+全文检索（主源）。不同模型 token 成本与「输出全文的意愿」都不同
// （实测部分模型对版权作品一律拒给），因此按历史成功率串行尝试、命中即停：
// 稳态下 1 次调用完成，成本最低；失败才逐级升级。
async function searchByLLM(title: string): Promise<MetaResult | null> {
  try {
    // 1) 缓存命中直接返回，零 token 成本
    const cached = loadCache(title);
    if (cached) return cached;

    const ms = await listModels();
    const chatModels = (ms as Array<{ id: string; disabled?: boolean }>)
      .filter((m) => m.disabled !== true && !/image|video|audio|tts|asr/i.test(m.id))
      .map((m) => m.id);
    if (chatModels.length === 0) return null;

    // 2) 按历史成功率排序，最多尝试 4 个模型（控制最坏情况的成本上限）
    const stats = loadModelStats();
    const ordered = [...chatModels]
      .sort((a, b) => modelScore(stats, b) - modelScore(stats, a) || a.localeCompare(b))
      .slice(0, 4);

    const clean = (v: unknown) =>
      typeof v === "string" && v.trim() && v.trim() !== "无" ? v.trim() : undefined;
    const merged: MetaResult = {};
    for (const id of ordered) {
      let r: MetaResult | null = null;
      try {
        r = await queryLLMOnce(id, title);
      } catch {
        r = null;
      }
      recordAttempt(stats, id, Boolean(r?.content));
      for (const k of ["author", "era", "intro", "category", "content"] as const) {
        const v = clean(r?.[k]);
        if (v && !merged[k]) merged[k] = v;
      }
      if (merged.content) break; // 命中全文即停
    }

    const result: MetaResult | null =
      merged.author || merged.era || merged.intro || merged.content ? merged : null;
    if (result) saveCache(title, result);
    return result;
  } catch {
    return null;
  }
}

export default function NewWorkPage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [era, setEra] = useState("");
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [categoryLocked, setCategoryLocked] = useState(false);
  const [intro, setIntro] = useState("");
  const [content, setContent] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [fetching, setFetching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  const doFetch = async () => {
    if (!title.trim()) {
      setMsg("请先输入作品名再检索。");
      return;
    }
    setFetching(true);
    setMsg("正在通过 AI 检索元数据与全文（按模型性价比逐个尝试）…");
    // 主源：LLM（中文经典命中率高，公版作品可直接返回全文）
    let meta = await searchByLLM(title);
    // 兜底：OpenLibrary（对外国作品补充，带 8s 超时）
    if (!meta) {
      setMsg("AI 未命中，尝试 OpenLibrary 书目库…");
      meta = await searchOpenLibrary(title);
    }
    setFetching(false);
    if (meta) {
      if (meta.author && !author) setAuthor(meta.author);
      if (meta.era && !era) setEra(meta.era);
      if (meta.intro && !intro) setIntro(meta.intro);
      if (meta.category && CATEGORIES.includes(meta.category) && !categoryLocked) {
        setCategory(meta.category);
      }
      if (meta.content && !content) {
        // 统一在文末附版权说明（存库时带上，前台原文末尾可见）
        const NOTICE = "\n\n——\n本文来源于网络，仅供学习交流使用，版权归原作者所有。若涉及版权问题，请联系我们删除。";
        setContent(meta.content + NOTICE);
        setMsg(
          "已通过 AI 自动填充元数据及全文（文末已附版权说明）。注意：AI 回忆的全文可能存在个别字词出入，发布前请务必人工核对。"
        );
      } else {
        setMsg(
          "已通过 AI 自动填充元数据，但全文未检索到（含自动重试；模型记忆不确定时宁缺毋错），请手动粘贴原文，或稍后再次点击检索。"
        );
      }
    } else {
      setMsg("AI 与 OpenLibrary 均未检索到，可手动录入。");
    }
  };

  const save = async () => {
    if (!title.trim()) {
      setMsg("作品名不能为空。");
      return;
    }
    setSaving(true);
    setMsg("");
    const { data, error } = await adminWrite({
      table: "works",
      op: "insert",
      data: {
        slug: makeSlug(title),
        title: title.trim(),
        author: author.trim() || null,
        era: era.trim() || null,
        category,
        source_type: "manual",
        source_url: sourceUrl.trim() || null,
        intro: intro.trim() || null,
        content: content.trim() || null,
        status: "draft",
      },
    });
    setSaving(false);
    if (error) {
      setMsg(`保存失败：${error}`);
      return;
    }
    const created = data?.[0] as { id: number } | undefined;
    router.push(created ? `/admin/works/${created.id}/edit` : "/admin/works");
  };

  const field =
    "w-full px-3 py-2 rounded-md border border-[var(--border)] bg-[var(--card)] text-sm outline-none focus:border-[var(--accent)]";

  return (
    <div className="max-w-2xl">
      <h1 className="font-serif-read text-2xl font-bold mb-6">录入 / 导入作品</h1>

      <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-6 space-y-4">
        <div className="flex gap-2">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="作品名 / 书名（必填）"
            className={field}
          />
          <button
            onClick={doFetch}
            disabled={fetching}
            className="shrink-0 px-4 rounded-md border border-[var(--accent)] text-[var(--accent)] text-sm hover:bg-[var(--accent)] hover:text-white transition-colors disabled:opacity-50"
          >
            {fetching ? "检索中…" : "自动检索元数据"}
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <input
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
            placeholder="作者"
            className={field}
          />
          <input
            value={era}
            onChange={(e) => setEra(e.target.value)}
            placeholder="年代（如 1934 / 清代）"
            className={field}
          />
        </div>

        <select
          value={category}
          onChange={(e) => {
            setCategory(e.target.value);
            setCategoryLocked(true);
          }}
          className={field}
        >
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>

        <input
          value={sourceUrl}
          onChange={(e) => setSourceUrl(e.target.value)}
          placeholder="原文来源链接（可选）"
          className={field}
        />

        <textarea
          value={intro}
          onChange={(e) => setIntro(e.target.value)}
          placeholder="作品简介"
          rows={3}
          className={field}
        />

        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="原文全文（粘贴于此；公版作品建议全文收录）"
          rows={12}
          className={`${field} font-serif-read leading-loose`}
        />

        {msg && <p className="text-xs text-[var(--muted)]">{msg}</p>}

        <button
          onClick={save}
          disabled={saving}
          className="w-full py-2.5 rounded-md bg-[var(--accent)] text-white text-sm disabled:opacity-50"
        >
          {saving ? "保存中…" : "保存为草稿"}
        </button>
      </div>
    </div>
  );
}
