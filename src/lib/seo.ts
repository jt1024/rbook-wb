import "server-only";

import type { Metadata } from "next";

/**
 * 站点规范化地址。绑定自有域名后只需设置 SITE_URL 环境变量，
 * canonical / OpenGraph / sitemap / JSON-LD 会全部跟着切换。
 */
export const SITE_URL = (
  process.env.SITE_URL ?? "https://classic-insight.app.workbuddy.host"
).replace(/\/+$/, "");

export const SITE_NAME = "经典解读";

export const DEFAULT_DESCRIPTION =
  "经典文章与书籍的人格化深读平台：同一篇经典，不同风格的解读，面向不同读者的深阅读体验。提供作品原文、逐段精读、金句与延伸书单。";

/** 把站内路径转成绝对 URL（canonical / sitemap / JSON-LD 共用）。 */
export function absoluteUrl(path = "/"): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return new URL(normalized, SITE_URL).toString();
}

/** 描述统一压成单行并截断，避免把全文或换行塞进 meta description。 */
export function cleanDescription(
  text: string | null | undefined,
  max = 155
): string {
  const flat = (text ?? "").replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  return `${flat.slice(0, max - 1).trimEnd()}…`;
}

export interface SeoInput {
  title: string;
  description: string;
  path: string;
  type?: "website" | "article";
  publishedTime?: string;
  modifiedTime?: string;
  authors?: string[];
  keywords?: string[];
  noIndex?: boolean;
}

/** 生成一页完整的 metadata，子页面只需给出自己的标题、描述和路径。 */
export function buildMetadata(input: SeoInput): Metadata {
  const url = absoluteUrl(input.path);
  const description = cleanDescription(input.description);
  const title = input.title;

  return {
    title,
    description,
    keywords: input.keywords?.filter(Boolean),
    authors: input.authors?.filter(Boolean).map((name) => ({ name })),
    alternates: { canonical: url },
    openGraph: {
      type: input.type ?? "website",
      url,
      siteName: SITE_NAME,
      title,
      description,
      locale: "zh_CN",
      ...(input.type === "article" && {
        authors: input.authors?.filter(Boolean),
        publishedTime: input.publishedTime,
        modifiedTime: input.modifiedTime,
      }),
    },
    twitter: {
      // 站点暂未提供 OG 图片，用 summary 小卡片避免分享平台期待一张不存在的大图。
      card: "summary",
      title,
      description,
    },
    robots: input.noIndex
      ? { index: false, follow: false }
      : {
          index: true,
          follow: true,
          "max-image-preview": "large",
          "max-snippet": -1,
          "max-video-preview": -1,
        },
  };
}

export type JsonLdObject = Record<string, unknown>;

export function websiteJsonLd(): JsonLdObject {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE_NAME,
    url: SITE_URL,
    description: DEFAULT_DESCRIPTION,
    inLanguage: "zh-CN",
  };
}

export function breadcrumbJsonLd(
  crumbs: Array<{ name: string; path?: string }>
): JsonLdObject {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((crumb, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: crumb.name,
      ...(crumb.path && { item: absoluteUrl(crumb.path) }),
    })),
  };
}

export function articleJsonLd(input: {
  title: string;
  description: string;
  path: string;
  author?: string | null;
  authorType?: "Person" | "Organization";
  publishedTime?: string;
  modifiedTime?: string;
  section?: string | null;
}): JsonLdObject {
  const url = absoluteUrl(input.path);
  // 作品原文的作者是原作者；解读文章由本站生成，作者应标为站点组织。
  const author =
    input.authorType === "Organization"
      ? { "@type": "Organization", name: SITE_NAME, url: SITE_URL }
      : { "@type": "Person", name: input.author || "佚名" };
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: input.title,
    description: cleanDescription(input.description),
    url,
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    datePublished: input.publishedTime,
    dateModified: input.modifiedTime ?? input.publishedTime,
    author,
    publisher: {
      "@type": "Organization",
      name: SITE_NAME,
      url: SITE_URL,
    },
    inLanguage: "zh-CN",
    ...(input.section && { articleSection: input.section }),
  };
}

/** 列表页用 ItemList，让搜索引擎理解页面内条目的链接关系。 */
export function itemListJsonLd(
  items: Array<{ name: string; path: string }>,
  name: string
): JsonLdObject {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name,
    numberOfItems: items.length,
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      url: absoluteUrl(item.path),
    })),
  };
}
