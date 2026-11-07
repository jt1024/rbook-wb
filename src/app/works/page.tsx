"use client";

import { useEffect, useMemo, useState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { listStyles, listWorks } from "@/lib/queries";
import type { Style, Work } from "@/lib/types";

function WorksInner() {
  const sp = useSearchParams();
  const [works, setWorks] = useState<Work[]>([]);
  const [styles, setStyles] = useState<Style[]>([]);
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [loading, setLoading] = useState(true);

  const styleSlug = sp.get("style") ?? "";

  useEffect(() => {
    (async () => {
      const [ws, ss] = await Promise.all([listWorks(), listStyles()]);
      setWorks(ws);
      setStyles(ss);
      setLoading(false);
    })();
  }, []);

  const categories = useMemo(
    () => Array.from(new Set(works.map((w) => w.category).filter(Boolean))) as string[],
    [works]
  );

  const filtered = works.filter((w) => {
    if (w.status !== "published") return false;
    if (category && w.category !== category) return false;
    if (q && !(w.title.includes(q) || (w.author ?? "").includes(q))) return false;
    return true;
  });

  const activeStyle = styles.find((s) => s.slug === styleSlug);

  return (
    <div className="max-w-5xl mx-auto px-4 py-10">
      <h1 className="font-serif-read text-3xl font-bold mb-2">作品库</h1>
      {activeStyle && (
        <p className="text-sm text-[var(--accent)] mb-2">
          当前视角：{activeStyle.name} —— {activeStyle.description}
        </p>
      )}

      {/* 筛选栏 */}
      <div className="flex flex-wrap gap-3 items-center my-6">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="搜索标题或作者…"
          className="px-3 py-2 rounded-md border border-[var(--border)] bg-[var(--card)] text-sm w-56 outline-none focus:border-[var(--accent)]"
        />
        <button
          onClick={() => setCategory("")}
          className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
            category === ""
              ? "bg-[var(--foreground)] text-[var(--background)] border-transparent"
              : "border-[var(--border)] text-[var(--muted)] hover:border-[var(--accent)]"
          }`}
        >
          全部
        </button>
        {categories.map((c) => (
          <button
            key={c}
            onClick={() => setCategory(c)}
            className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
              category === c
                ? "bg-[var(--foreground)] text-[var(--background)] border-transparent"
                : "border-[var(--border)] text-[var(--muted)] hover:border-[var(--accent)]"
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      {loading && <p className="text-[var(--muted)] py-10 text-center">加载中…</p>}

      {!loading && filtered.length === 0 && (
        <div className="rounded-lg border border-dashed border-[var(--border)] p-10 text-center text-[var(--muted)]">
          没有找到符合条件的作品。
        </div>
      )}

      <div className="space-y-4">
        {filtered.map((w) => (
          <Link
            key={w.id}
            href={`/works/${w.slug}`}
            className="block rounded-lg border border-[var(--border)] bg-[var(--card)] p-5 hover:shadow-md transition-shadow"
          >
            <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--muted)]">
              {w.category && (
                <span className="px-2 py-0.5 rounded bg-[var(--background)] border border-[var(--border)]">
                  {w.category}
                </span>
              )}
              <span>
                {w.author ?? "佚名"}
                {w.era ? ` · ${w.era}` : ""}
              </span>
            </div>
            <div className="mt-1.5 font-serif-read text-xl font-bold">《{w.title}》</div>
            <p className="mt-1.5 text-sm text-[var(--muted)] line-clamp-2 leading-relaxed">
              {w.intro || "（暂无简介）"}
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}

export default function WorksPage() {
  return (
    <Suspense fallback={<div className="py-20 text-center text-[var(--muted)]">加载中…</div>}>
      <WorksInner />
    </Suspense>
  );
}
