import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "页面不存在",
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-24 text-center">
      <h1 className="font-serif-read text-3xl font-bold">页面不存在</h1>
      <p className="mt-4 text-sm text-[var(--muted)]">
        这篇内容可能尚未发布，或链接已经失效。
      </p>
      <Link
        href="/works"
        className="inline-block mt-8 px-6 py-2.5 rounded-full border border-[var(--border)] text-sm hover:border-[var(--accent)] transition-colors"
      >
        去作品库看看 →
      </Link>
    </div>
  );
}
