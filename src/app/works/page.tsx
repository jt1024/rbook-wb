import { Suspense } from "react";
import type { Metadata } from "next";
import { JsonLd } from "@/components/JsonLd";
import { listStyles, listWorks } from "@/lib/serverQueries";
import { buildMetadata, itemListJsonLd } from "@/lib/seo";
import { WorksBrowser } from "./WorksBrowser";

export const dynamic = "force-dynamic";

export const metadata: Metadata = buildMetadata({
  title: "作品库",
  description:
    "浏览全部已收录的经典作品原文：中国现代散文、公版古文与儿童经典，每篇附多种风格的逐段精读与延伸书单。",
  path: "/works",
  keywords: ["经典作品", "作品库", "课文原文", "现代散文", "古文"],
});

export default async function WorksPage() {
  const [allWorks, styles] = await Promise.all([
    listWorks({ status: "published" }),
    listStyles(),
  ]);
  const works = allWorks.filter((w) => w.status === "published");

  return (
    <>
      <JsonLd
        data={itemListJsonLd(
          works.map((w) => ({
            name: `《${w.title}》`,
            path: `/works/${w.slug}`,
          })),
          "经典解读 · 作品库"
        )}
      />
      <Suspense
        fallback={
          <div className="py-20 text-center text-[var(--muted)]">加载中…</div>
        }
      >
        <WorksBrowser works={works} styles={styles} />
      </Suspense>
    </>
  );
}
