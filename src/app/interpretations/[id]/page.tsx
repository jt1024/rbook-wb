import { cache } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { JsonLd } from "@/components/JsonLd";
import {
  getInterpretationById,
  getWorkById,
  listAudiences,
  listStyles,
} from "@/lib/serverQueries";
import {
  articleJsonLd,
  breadcrumbJsonLd,
  buildMetadata,
} from "@/lib/seo";
import { formatBookTitle } from "@/lib/types";

export const dynamic = "force-dynamic";

const loadInterpretation = cache(async (id: number) =>
  getInterpretationById(id)
);

function summaryOf(interp: {
  summary: string | null;
  structured_content: { summary?: string } | null;
}): string {
  return interp.summary?.trim() || interp.structured_content?.summary?.trim() || "";
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const numId = Number(id);
  if (!Number.isInteger(numId) || numId <= 0) {
    return buildMetadata({
      title: "解读不存在",
      description: "该解读尚未发布或链接已失效。",
      path: `/interpretations/${id}`,
      noIndex: true,
    });
  }

  const interp = await loadInterpretation(numId);
  if (!interp || interp.status !== "published") {
    return buildMetadata({
      title: "解读不存在",
      description: "该解读尚未发布或链接已失效。",
      path: `/interpretations/${id}`,
      noIndex: true,
    });
  }

  const [work, styles] = await Promise.all([getWorkById(interp.work_id), listStyles()]);
  const style = styles.find((s) => s.id === interp.style_id);
  const title =
    interp.title ||
    `${style?.name ?? "经典"}解读《${work?.title ?? "作品"}》`;
  const description =
    summaryOf(interp) ||
    `${title}：背景梳理、逐段精读、金句与延伸书单。`;

  return buildMetadata({
    title,
    description,
    path: `/interpretations/${interp.id}`,
    type: "article",
    publishedTime: interp.created_at,
    modifiedTime: interp.updated_at,
    authors: [work?.author ?? "佚名"],
    keywords: [
      work?.title ?? "",
      style?.name ?? "",
      "经典解读",
      "逐段精读",
      "金句",
    ],
  });
}

export default async function InterpretationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const numId = Number(id);
  if (!Number.isInteger(numId) || numId <= 0) notFound();

  const interp = await loadInterpretation(numId);
  if (!interp || interp.status !== "published") notFound();

  const [work, styles, audiences] = await Promise.all([
    getWorkById(interp.work_id),
    listStyles(),
    listAudiences(),
  ]);
  if (!work || work.status !== "published") notFound();

  const style = styles.find((s) => s.id === interp.style_id) ?? null;
  const audience = audiences.find((a) => a.id === interp.audience_id) ?? null;
  const c = interp.structured_content;
  const pageTitle =
    interp.title || `${style?.name ?? "经典"}解读《${work.title}》`;
  const description = summaryOf(interp) || `${pageTitle}：逐段精读与延伸书单。`;

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <JsonLd
        data={[
          breadcrumbJsonLd([
            { name: "首页", path: "/" },
            { name: "作品库", path: "/works" },
            { name: `《${work.title}》`, path: `/works/${work.slug}` },
            { name: pageTitle },
          ]),
          articleJsonLd({
            title: pageTitle,
            description,
            path: `/interpretations/${interp.id}`,
            authorType: "Organization",
            publishedTime: interp.created_at,
            modifiedTime: interp.updated_at,
            section: work.category,
          }),
        ]}
      />

      {/* 面包屑 */}
      <div className="text-xs text-[var(--muted)] mb-6">
        <Link href="/works" className="hover:text-[var(--accent)]">
          作品库
        </Link>
        {" / "}
        <Link href={`/works/${work.slug}`} className="hover:text-[var(--accent)]">
          《{work.title}》
        </Link>
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
          {pageTitle}
        </h1>
        <p className="mt-3 text-sm text-[var(--muted)]">
          原作：{work.author ?? "佚名"}《{work.title}》
        </p>
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
      <div className="mt-12 text-center">
        <Link
          href={`/works/${work.slug}`}
          className="inline-block px-6 py-2.5 rounded-full border border-[var(--border)] text-sm hover:border-[var(--accent)] transition-colors"
        >
          ← 查看《{work.title}》的更多解读
        </Link>
      </div>
    </div>
  );
}
