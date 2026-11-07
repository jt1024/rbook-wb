"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { cloud } from "@/lib/cloud";
import { getWorkById } from "@/lib/queries";
import type { Work } from "@/lib/types";

const CATEGORIES = ["中国现代散文", "公版古文", "外国经典", "儿童经典", "其他"];

export default function EditWorkPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [work, setWork] = useState<Work | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    (async () => {
      const w = await getWorkById(Number(id));
      setWork(w);
    })();
  }, [id]);

  if (!work) {
    return <p className="text-[var(--muted)]">加载中…（若无内容则作品不存在）</p>;
  }

  const patch = (k: keyof Work, v: string | null) =>
    setWork({ ...work, [k]: v } as Work);

  const save = async () => {
    setSaving(true);
    setMsg("");
    const { error } = await cloud.database
      .from("works")
      .update({
        title: work.title,
        author: work.author,
        era: work.era,
        category: work.category,
        intro: work.intro,
        content: work.content,
        source_url: work.source_url,
        updated_at: new Date().toISOString(),
      })
      .eq("id", work.id);
    setSaving(false);
    setMsg(error ? `保存失败：${(error as Error).message}` : "已保存。");
  };

  const field =
    "w-full px-3 py-2 rounded-md border border-[var(--border)] bg-[var(--card)] text-sm outline-none focus:border-[var(--accent)]";

  return (
    <div className="max-w-2xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-serif-read text-2xl font-bold">编辑：《{work.title}》</h1>
        <a href="/admin/works" className="text-sm text-[var(--muted)] hover:underline">
          ← 返回列表
        </a>
      </div>

      <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-6 space-y-4">
        <input
          value={work.title}
          onChange={(e) => patch("title", e.target.value)}
          placeholder="作品名"
          className={field}
        />
        <div className="grid grid-cols-2 gap-3">
          <input
            value={work.author ?? ""}
            onChange={(e) => patch("author", e.target.value)}
            placeholder="作者"
            className={field}
          />
          <input
            value={work.era ?? ""}
            onChange={(e) => patch("era", e.target.value)}
            placeholder="年代"
            className={field}
          />
        </div>
        <select
          value={work.category ?? ""}
          onChange={(e) => patch("category", e.target.value)}
          className={field}
        >
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <input
          value={work.source_url ?? ""}
          onChange={(e) => patch("source_url", e.target.value)}
          placeholder="原文来源链接"
          className={field}
        />
        <textarea
          value={work.intro ?? ""}
          onChange={(e) => patch("intro", e.target.value)}
          placeholder="简介"
          rows={3}
          className={field}
        />
        <textarea
          value={work.content ?? ""}
          onChange={(e) => patch("content", e.target.value)}
          placeholder="原文全文"
          rows={12}
          className={`${field} font-serif-read leading-loose`}
        />

        {msg && <p className="text-xs text-[var(--muted)]">{msg}</p>}

        <button
          onClick={save}
          disabled={saving}
          className="w-full py-2.5 rounded-md bg-[var(--accent)] text-white text-sm disabled:opacity-50"
        >
          {saving ? "保存中…" : "保存修改"}
        </button>
      </div>
    </div>
  );
}
