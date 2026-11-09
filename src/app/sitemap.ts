import type { MetadataRoute } from "next";
import {
  listInterpretations,
  listWorks,
} from "@/lib/serverQueries";
import { absoluteUrl } from "@/lib/seo";

// 每 10 分钟重新生成一次；数据库暂时不可用时退回静态页，保证构建不中断。
export const revalidate = 600;

function toDate(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticEntries: MetadataRoute.Sitemap = [
    { url: absoluteUrl("/"), changeFrequency: "daily", priority: 1 },
    { url: absoluteUrl("/works"), changeFrequency: "daily", priority: 0.9 },
    { url: absoluteUrl("/about"), changeFrequency: "monthly", priority: 0.3 },
  ];

  try {
    const [works, interps] = await Promise.all([
      listWorks({ status: "published" }),
      listInterpretations({ status: "published" }),
    ]);
    const publishedWorkIds = new Set(works.map((w) => w.id));

    const workEntries: MetadataRoute.Sitemap = works
      .filter((w) => w.status === "published" && Boolean(w.slug))
      .map((w) => ({
        url: absoluteUrl(`/works/${w.slug}`),
        lastModified: toDate(w.updated_at || w.created_at),
        changeFrequency: "weekly",
        priority: 0.8,
      }));

    // 只收录挂在已发布作品下的解读，避免把草稿内容暴露给搜索引擎。
    const interpEntries: MetadataRoute.Sitemap = interps
      .filter((i) => publishedWorkIds.has(i.work_id))
      .map((i) => ({
        url: absoluteUrl(`/interpretations/${i.id}`),
        lastModified: toDate(i.updated_at || i.created_at),
        changeFrequency: "weekly",
        priority: 0.7,
      }));

    return [...staticEntries, ...workEntries, ...interpEntries];
  } catch (e) {
    console.error("[sitemap] 读取已发布内容失败，仅输出静态页", e);
    return staticEntries;
  }
}
