import type { Metadata } from "next";
import Link from "next/link";
import { JsonLd } from "@/components/JsonLd";
import {
  listInterpretations,
  listStyles,
  listWorks,
} from "@/lib/serverQueries";
import {
  DEFAULT_DESCRIPTION,
  buildMetadata,
  itemListJsonLd,
} from "@/lib/seo";

export const dynamic = "force-dynamic";

const HOME_TITLE = "经典解读 · 把经典读出味道来";

export const metadata: Metadata = {
  ...buildMetadata({
    title: HOME_TITLE,
    description: DEFAULT_DESCRIPTION,
    path: "/",
    keywords: ["经典解读", "名著解读", "课文精读", "多风格解读"],
  }),
  // 首页用绝对标题，避免被根布局的 template 拼成「… | 经典解读」重复站名。
  title: { absolute: HOME_TITLE },
};

export default async function HomePage() {
  const [works, styles, interps] = await Promise.all([
    listWorks({ status: "published", limit: 8 }),
    listStyles(),
    listInterpretations({ status: "published" }),
  ]);
  const published = works.filter((w) => w.status === "published");

  return (
    <div className="max-w-5xl mx-auto px-4 py-10">
      <JsonLd
        data={itemListJsonLd(
          published.map((w) => ({
            name: `《${w.title}》`,
            path: `/works/${w.slug}`,
          })),
          "经典解读 · 最新收录作品"
        )}
      />

      {/* Hero */}
      <section className="text-center py-12">
        <h1 className="font-serif-read text-4xl md:text-5xl font-bold tracking-wide">
          把经典<span className="text-[var(--accent)]">读出味道</span>来
        </h1>
        <p className="mt-4 text-[var(--muted)] max-w-xl mx-auto leading-relaxed">
          一篇经典，多种读法。孔庆东的泼辣、钱钟书的机锋、郑渊洁的童趣——
          选择适合你的解读风格与阅读视角，重新遇见那些被时间验证的文字。
        </p>
      </section>

      {/* 风格入口 */}
      {styles.length > 0 && (
        <section className="mb-12">
          <h2 className="text-sm text-[var(--muted)] mb-3 tracking-widest">
            选择一种解读声音
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {styles.map((s) => (
              <Link
                key={s.id}
                href={`/works?style=${s.slug}`}
                className="block rounded-lg border border-[var(--border)] bg-[var(--card)] p-5 hover:shadow-md hover:-translate-y-0.5 transition-all"
              >
                <div className="font-serif-read text-lg font-bold">{s.name}</div>
                <p className="mt-2 text-sm text-[var(--muted)] leading-relaxed">
                  {s.description}
                </p>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* 最新作品 */}
      <section className="mb-12">
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-sm text-[var(--muted)] tracking-widest">最新收录</h2>
          <Link href="/works" className="text-sm text-[var(--accent)] hover:underline">
            全部作品 →
          </Link>
        </div>
        {published.length === 0 && (
          <div className="rounded-lg border border-dashed border-[var(--border)] p-10 text-center text-[var(--muted)]">
            内容筹备中——前往后台录入或导入第一部经典吧。
          </div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {published.map((w) => {
            const count = interps.filter(
              (i) => i.work_id === w.id && i.status === "published"
            ).length;
            const chars = w.content?.length ?? 0;
            const minutes = Math.max(1, Math.round(chars / 400));
            return (
              <Link
                key={w.id}
                href={`/works/${w.slug}`}
                className="block rounded-lg border border-[var(--border)] bg-[var(--card)] p-5 hover:shadow-md transition-shadow"
              >
                <div className="flex items-center gap-2 text-xs text-[var(--muted)]">
                  {w.category && (
                    <span className="px-2 py-0.5 rounded bg-[var(--background)] border border-[var(--border)]">
                      {w.category}
                    </span>
                  )}
                  <span>
                    {w.author ?? "佚名"}
                    {w.era ? ` · ${w.era}` : ""}
                  </span>
                  {chars > 0 && (
                    <span className="ml-auto shrink-0 text-[var(--accent)]">
                      全文 · 约 {minutes} 分钟
                    </span>
                  )}
                </div>
                <div className="mt-2 font-serif-read text-xl font-bold">
                  《{w.title}》
                </div>
                <p className="mt-2 text-sm text-[var(--muted)] line-clamp-2 leading-relaxed">
                  {w.intro || "（暂无简介）"}
                </p>
                {count > 0 && (
                  <div className="mt-3 text-xs text-[var(--accent)]">
                    {count} 篇解读
                  </div>
                )}
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}
