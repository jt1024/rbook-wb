"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { adminWrite } from "@/lib/adminDb";
import { searchWorkMeta } from "@/lib/aiClient";
import { makeSlug } from "@/lib/queries";

const CATEGORIES = ["中国现代散文", "公版古文", "外国经典", "儿童经典", "其他"];

// 统一在文末附版权说明（存库时带上，前台原文末尾可见）
const NOTICE =
  "\n\n——\n本文来源于网络，仅供学习交流使用，版权归原作者所有。若涉及版权问题，请联系我们删除。";

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
    setMsg("正在通过服务端 AI 检索元数据与全文（按模型性价比逐个尝试）…");
    try {
      // 模型级联、成功率统计、结果缓存全部在服务端执行：
      // 浏览器既不接触 LLM 网关，也不消耗任何模型额度。
      const outcome = await searchWorkMeta(title.trim());
      const meta = outcome.meta;
      if (meta) {
        if (meta.author && !author) setAuthor(meta.author);
        if (meta.era && !era) setEra(meta.era);
        if (meta.intro && !intro) setIntro(meta.intro);
        if (meta.category && CATEGORIES.includes(meta.category) && !categoryLocked) {
          setCategory(meta.category);
        }
        const source =
          outcome.source === "cache"
            ? "命中服务端缓存（零 token）"
            : outcome.source === "openlibrary"
              ? "由 OpenLibrary 书目库补充"
              : `由服务端 AI 检索（尝试 ${outcome.modelsTried} 个模型）`;
        if (meta.content && !content) {
          setContent(meta.content + NOTICE);
          setMsg(
            `已自动填充元数据及全文（${source}，文末已附版权说明）。注意：AI 回忆的全文可能存在个别字词出入，发布前请务必人工核对。`
          );
        } else {
          setMsg(
            `已自动填充元数据（${source}），但全文未检索到（模型记忆不确定时宁缺毋错），请手动粘贴原文，或稍后再次点击检索。`
          );
        }
      } else {
        setMsg("服务端检索未命中，可手动录入，或稍后重试。");
      }
    } catch (e) {
      setMsg(`检索失败：${(e as Error).message}`);
    } finally {
      setFetching(false);
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
