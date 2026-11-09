"use client";

import { useState } from "react";
import Link from "next/link";
import type { Audience, Interpretation, Style, Work } from "@/lib/types";

/**
 * 作品详情页的交互部分（原文展开、风格/受众筛选）。
 * 全部内容由服务端页面传入并已渲染进首屏 HTML，这里只负责交互状态。
 */
export function WorkDetailClient({
  work,
  styles,
  audiences,
  interps,
}: {
  work: Work;
  styles: Style[];
  audiences: Audience[];
  interps: Interpretation[];
}) {
  const [showOriginal, setShowOriginal] = useState(true); // 默认展开全文，点进来即可阅读
  const [styleFilter, setStyleFilter] = useState<number | null>(null);
  const [audienceFilter, setAudienceFilter] = useState<number | null>(null);

  const filtered = interps.filter(
    (i) =>
      (styleFilter === null || i.style_id === styleFilter) &&
      (audienceFilter === null || i.audience_id === audienceFilter)
  );

  // 全文按空行分段渲染成真实 <p>，以启用 article-serif 的缩进/间距样式；
  // 文末落款（如「九月十八日。」）右对齐、不缩进。
  const paragraphs = (work.content ?? "")
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean);

  return (
    <div className="max-w-4xl mx-auto px-4 py-10">
      {/* 作品头 */}
      <div className="text-center pb-8 border-b border-[var(--border)]">
        <div className="text-xs text-[var(--muted)] tracking-widest mb-3">
          {work.category ?? ""} · {work.author ?? "佚名"}
          {work.era ? ` · ${work.era}` : ""}
        </div>
        <h1 className="font-serif-read text-4xl font-bold">《{work.title}》</h1>
        {work.intro && (
          <p className="mt-4 text-sm text-[var(--muted)] max-w-xl mx-auto leading-relaxed">
            {work.intro}
          </p>
        )}
        <button
          onClick={() => setShowOriginal((v) => !v)}
          className="mt-5 px-4 py-2 rounded-full border border-[var(--border)] text-sm hover:border-[var(--accent)] transition-colors"
        >
          {showOriginal ? "收起原文" : "阅读原文"}
        </button>
      </div>

      {/* 原文 */}
      {showOriginal && (
        <div className="my-8 rounded-lg bg-[var(--card)] border border-[var(--border)] p-6 md:p-10">
          <div className="article-serif max-w-2xl mx-auto">
            {paragraphs.length > 0 ? (
              paragraphs.map((p, idx) => {
                const isSignoff = /^[^\s，。]{1,10}日。$/.test(p);
                return (
                  <p
                    key={idx}
                    className={isSignoff ? "no-indent text-right text-[var(--muted)]" : ""}
                  >
                    {p}
                  </p>
                );
              })
            ) : (
              <p className="no-indent text-[var(--muted)]">（暂无原文）</p>
            )}
          </div>
        </div>
      )}

      {/* 解读区 */}
      <section className="mt-10">
        <h2 className="font-serif-read text-2xl font-bold mb-4">
          解读 <span className="text-sm text-[var(--muted)] font-normal">({filtered.length})</span>
        </h2>

        {/* 风格筛选 */}
        <div className="flex flex-wrap gap-2 mb-3">
          <FilterChip
            active={styleFilter === null}
            onClick={() => setStyleFilter(null)}
            label="全部风格"
          />
          {styles.map((s) => (
            <FilterChip
              key={s.id}
              active={styleFilter === s.id}
              onClick={() => setStyleFilter(styleFilter === s.id ? null : s.id)}
              label={s.name}
            />
          ))}
        </div>
        {/* 受众筛选 */}
        <div className="flex flex-wrap gap-2 mb-6">
          <FilterChip
            active={audienceFilter === null}
            onClick={() => setAudienceFilter(null)}
            label="全部读者"
          />
          {audiences.map((a) => (
            <FilterChip
              key={a.id}
              active={audienceFilter === a.id}
              onClick={() => setAudienceFilter(audienceFilter === a.id ? null : a.id)}
              label={a.name}
            />
          ))}
        </div>

        {filtered.length === 0 && (
          <div className="rounded-lg border border-dashed border-[var(--border)] p-10 text-center text-[var(--muted)]">
            该筛选组合下暂无解读，换一个维度试试。
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((i) => {
            const st = styles.find((s) => s.id === i.style_id);
            const au = audiences.find((a) => a.id === i.audience_id);
            return (
              <Link
                key={i.id}
                href={`/interpretations/${i.id}`}
                className="block rounded-lg border border-[var(--border)] bg-[var(--card)] p-5 hover:shadow-md transition-shadow"
              >
                <div className="flex flex-wrap gap-2 text-xs">
                  <span className="px-2 py-0.5 rounded-full bg-[var(--accent)] text-white">
                    {st?.name ?? "未知风格"}
                  </span>
                  <span className="px-2 py-0.5 rounded-full border border-[var(--border)] text-[var(--muted)]">
                    给{au?.name ?? "读者"}
                  </span>
                </div>
                <div className="mt-3 font-serif-read text-lg font-bold">
                  {i.title || `${st?.name ?? ""}谈《${work.title}》`}
                </div>
                <p className="mt-2 text-sm text-[var(--muted)] line-clamp-3 leading-relaxed">
                  {i.summary || i.structured_content?.summary || "（暂无摘要）"}
                </p>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1 rounded-full text-xs border transition-colors ${
        active
          ? "bg-[var(--foreground)] text-[var(--background)] border-transparent"
          : "border-[var(--border)] text-[var(--muted)] hover:border-[var(--accent)]"
      }`}
    >
      {label}
    </button>
  );
}
