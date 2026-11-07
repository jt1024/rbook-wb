"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  getInterpretationById,
  getWorkById,
  listAudiences,
  listStyles,
} from "@/lib/queries";
import { formatBookTitle } from "@/lib/types";
import type { Audience, Interpretation, Style, Work } from "@/lib/types";

export default function InterpretationPage() {
  const { id } = useParams<{ id: string }>();
  const [interp, setInterp] = useState<Interpretation | null>(null);
  const [work, setWork] = useState<Work | null>(null);
  const [style, setStyle] = useState<Style | null>(null);
  const [audience, setAudience] = useState<Audience | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const i = await getInterpretationById(Number(id));
      setInterp(i);
      if (i) {
        const [w, ss, as] = await Promise.all([
          getWorkById(i.work_id),
          listStyles(),
          listAudiences(),
        ]);
        setWork(w);
        setStyle(ss.find((s) => s.id === i.style_id) ?? null);
        setAudience(as.find((a) => a.id === i.audience_id) ?? null);
      }
      setLoading(false);
    })();
  }, [id]);

  if (loading) {
    return <div className="py-20 text-center text-[var(--muted)]">加载中…</div>;
  }
  if (!interp || interp.status !== "published") {
    return <div className="py-20 text-center text-[var(--muted)]">解读不存在或未发布。</div>;
  }

  const c = interp.structured_content;

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      {/* 面包屑 */}
      <div className="text-xs text-[var(--muted)] mb-6">
        <Link href="/works" className="hover:text-[var(--accent)]">
          作品库
        </Link>
        {work && (
          <>
            {" / "}
            <Link href={`/works/${work.slug}`} className="hover:text-[var(--accent)]">
              《{work.title}》
            </Link>
          </>
        )}
      </div>

      {/* 头部 */}
      <header className="text-center pb-8 border-b border-[var(--border)]">
        <div className="flex justify-center flex-wrap gap-2 text-xs mb-4">
          {style && (
            <span className="px-3 py-1 rounded-full bg-[var(--accent)] text-white">
              {style.name}
            </span>
          )}
          {audience && (
            <span className="px-3 py-1 rounded-full border border-[var(--border)] text-[var(--muted)]">
              给{audience.name}的版本
            </span>
          )}
        </div>
        <h1 className="font-serif-read text-3xl md:text-4xl font-bold leading-snug">
          {interp.title || `${style?.name ?? ""}解读《${work?.title ?? ""}》`}
        </h1>
        {work && (
          <p className="mt-3 text-sm text-[var(--muted)]">
            原作：{work.author ?? "佚名"}《{work.title}》
          </p>
        )}
      </header>

      {c && (
        <article className="mt-10">
          {/* 摘要 */}
          <p className="text-lg leading-loose font-serif-read first-letter:text-3xl">
            {c.summary}
          </p>

          {/* 背景板 */}
          <section className="mt-8 rounded-lg bg-[var(--card)] border border-[var(--border)] p-5">
            <h2 className="text-xs tracking-widest text-[var(--accent)] mb-2">作者与时代</h2>
            <p className="text-sm leading-loose text-[var(--muted)]">{c.background}</p>
          </section>

          {/* 逐段精读 */}
          <section className="mt-10 space-y-10">
            {c.sections.map((sec, idx) => (
              <div key={idx}>
                <blockquote className="font-serif-read text-lg leading-loose border-l-4 border-[var(--accent)] pl-4 text-[var(--foreground)]">
                  {sec.quote}
                </blockquote>
                <div className="mt-4 prose-interp text-[15px] text-[var(--foreground)] leading-relaxed whitespace-pre-wrap">
                  {sec.comment}
                </div>
              </div>
            ))}
          </section>

          {/* 金句 */}
          {c.highlights.length > 0 && (
            <section className="mt-12">
              <h2 className="text-xs tracking-widest text-[var(--accent)] mb-4">
                ✦ 值得抄下来的句子
              </h2>
              <ul className="space-y-3">
                {c.highlights.map((h, i) => (
                  <li
                    key={i}
                    className="font-serif-read text-lg leading-relaxed pl-4 border-l-2 border-[var(--border)]"
                  >
                    {h}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* 延伸书单 */}
          {c.reading_list.length > 0 && (
            <section className="mt-12 mb-6">
              <h2 className="text-xs tracking-widest text-[var(--accent)] mb-4">
                ✦ 延伸阅读
              </h2>
              <ul className="space-y-3">
                {c.reading_list.map((b, i) => (
                  <li
                    key={i}
                    className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4"
                  >
                    <span className="font-serif-read font-bold">{formatBookTitle(b.title)}</span>
                    <span className="ml-2 text-sm text-[var(--muted)]">{b.reason}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </article>
      )}

      {/* 返回 */}
      {work && (
        <div className="mt-12 text-center">
          <Link
            href={`/works/${work.slug}`}
            className="inline-block px-6 py-2.5 rounded-full border border-[var(--border)] text-sm hover:border-[var(--accent)] transition-colors"
          >
            ← 查看《{work.title}》的更多解读
          </Link>
        </div>
      )}
    </div>
  );
}
