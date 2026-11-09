import type { Metadata } from "next";
import { JsonLd } from "@/components/JsonLd";
import { absoluteUrl, buildMetadata, SITE_NAME } from "@/lib/seo";

export const metadata: Metadata = buildMetadata({
  title: "关于本站",
  description:
    "了解「经典解读」的内容理念：原文与解读分离收录、多风格与多受众组合、AI 生成加人工审核的发布流程，以及版权说明。",
  path: "/about",
  keywords: ["关于本站", "经典解读", "版权说明", "内容理念"],
});

export default function AboutPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-12">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "AboutPage",
          name: `关于「${SITE_NAME}」`,
          url: absoluteUrl("/about"),
          inLanguage: "zh-CN",
        }}
      />
      <h1 className="font-serif-read text-3xl font-bold mb-8">关于「经典解读」</h1>
      <div className="space-y-6 text-[15px] leading-loose text-[var(--foreground)]">
        <p>
          「经典解读」是一个经典文章与书籍的<strong>人格化深读平台</strong>。
          我们相信：一篇经典不是读完就束之高阁的作业，而是值得用不同的人生视角反复咀嚼的活文本。
        </p>
        <p>
          就像孔庆东解读钱钟书的《说笑》那样——同一篇文章，在泼辣幽默的北京腔里、
          在机智冷峻的博喻里、在童话大王的直白里，会呈现完全不同的面貌。
        </p>
        <h2 className="font-serif-read text-xl font-bold pt-4">我们怎么做</h2>
        <ul className="list-disc pl-6 space-y-2">
          <li>作品原文与解读分离收录：一部经典之下，可以挂多个解读版本；</li>
          <li>每个解读版本有两个维度——<strong>解读风格</strong>（谁在讲）与<strong>目标读者</strong>（讲给谁听）；</li>
          <li>解读内容由 AI 按风格人格生成初稿，经质量校验与人工审核后发布；</li>
          <li>公版作品可全文收录；现代作品以原创解读与书目信息为主。</li>
        </ul>
        <h2 className="font-serif-read text-xl font-bold pt-4">版权说明</h2>
        <p className="text-[var(--muted)]">
          本站内容仅供学习交流。如内容涉及权利争议，可通过后台渠道联系我们下架处理。
        </p>
      </div>
    </div>
  );
}
