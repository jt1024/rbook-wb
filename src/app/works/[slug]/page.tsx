import { cache } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { JsonLd } from "@/components/JsonLd";
import {
  getWorkBySlug,
  listAudiences,
  listInterpretations,
  listStyles,
} from "@/lib/serverQueries";
import {
  articleJsonLd,
  breadcrumbJsonLd,
  buildMetadata,
  itemListJsonLd,
} from "@/lib/seo";
import { WorkDetailClient } from "./WorkDetailClient";

export const dynamic = "force-dynamic";

// generateMetadata 与页面渲染共用同一次查询，避免重复访问数据库。
const loadWork = cache(async (slug: string) => getWorkBySlug(slug));

function descriptionFor(
  work: NonNullable<Awaited<ReturnType<typeof getWorkBySlug>>>
): string {
  if (work.intro?.trim()) return work.intro;
  return `《${work.title}》原文在线阅读，附${work.author ?? "佚名"}创作背景、逐段精读、金句摘录与延伸书单，提供多种风格的经典解读。`;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const work = await loadWork(slug);

  if (!work || work.status !== "published") {
    return buildMetadata({
      title: "作品不存在",
      description: "该作品尚未发布或链接已失效。",
      path: `/works/${slug}`,
      noIndex: true,
    });
  }

  return buildMetadata({
    title: `《${work.title}》原文与解读`,
    description: descriptionFor(work),
    path: `/works/${work.slug}`,
    type: "article",
    publishedTime: work.created_at,
    modifiedTime: work.updated_at,
    authors: [work.author ?? "佚名"],
    keywords: [
      work.title,
      work.author ?? "",
      work.category ?? "",
      "原文",
      "逐段精读",
      "经典解读",
    ],
  });
}

export default async function WorkDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const work = await loadWork(slug);

  // 服务端就挡住草稿 / 下架内容，避免未发布内容进入公开 HTML。
  if (!work || work.status !== "published") notFound();

  const [styles, audiences, interps] = await Promise.all([
    listStyles(),
    listAudiences(),
    listInterpretations({ status: "published", workId: work.id }),
  ]);
  const publishedInterps = interps.filter((i) => i.status === "published");
  const pageTitle = `《${work.title}》原文与解读`;

  return (
    <>
      <JsonLd
        data={[
          breadcrumbJsonLd([
            { name: "首页", path: "/" },
            { name: "作品库", path: "/works" },
            { name: `《${work.title}》` },
          ]),
          articleJsonLd({
            title: pageTitle,
            description: descriptionFor(work),
            path: `/works/${work.slug}`,
            author: work.author,
            publishedTime: work.created_at,
            modifiedTime: work.updated_at,
            section: work.category,
          }),
          itemListJsonLd(
            publishedInterps.map((i) => ({
              name: i.title || `《${work.title}》解读`,
              path: `/interpretations/${i.id}`,
            })),
            `《${work.title}》的解读列表`
          ),
        ]}
      />
      <WorkDetailClient
        work={work}
        styles={styles}
        audiences={audiences}
        interps={publishedInterps}
      />
    </>
  );
}
