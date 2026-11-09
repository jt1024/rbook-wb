import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { JsonLd } from "@/components/JsonLd";
import {
  DEFAULT_DESCRIPTION,
  SITE_NAME,
  SITE_URL,
  websiteJsonLd,
} from "@/lib/seo";
import "./globals.css";

const homeTitle = `${SITE_NAME} · 把经典读出味道来`;

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: homeTitle,
    template: `%s | ${SITE_NAME}`,
  },
  description: DEFAULT_DESCRIPTION,
  applicationName: SITE_NAME,
  keywords: [
    "经典解读",
    "名著解读",
    "课文精读",
    "逐段精读",
    "现代散文",
    "延伸阅读",
  ],
  category: "education",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: SITE_NAME,
    title: homeTitle,
    description: DEFAULT_DESCRIPTION,
    locale: "zh_CN",
  },
  twitter: {
    card: "summary",
    title: homeTitle,
    description: DEFAULT_DESCRIPTION,
  },
  robots: {
    index: true,
    follow: true,
    "max-image-preview": "large",
    "max-snippet": -1,
    "max-video-preview": -1,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#faf8f3",
};

const navItems = [
  { href: "/", label: "首页" },
  { href: "/works", label: "作品库" },
  { href: "/about", label: "关于" },
  { href: "/admin", label: "后台" },
];

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen flex flex-col antialiased">
        <JsonLd data={websiteJsonLd()} />
        <header className="border-b border-[var(--border)] bg-[var(--card)]">
          <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
            <Link href="/" className="font-serif-read text-xl font-bold tracking-wide">
              经典<span className="text-[var(--accent)]">解读</span>
            </Link>
            <nav className="flex gap-5 text-sm text-[var(--muted)]">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="hover:text-[var(--foreground)] transition-colors"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
        </header>
        <main className="flex-1">{children}</main>
        <footer className="border-t border-[var(--border)] py-6 text-center text-xs text-[var(--muted)]">
          经典解读 · 把经典读出味道来 · 内容仅供学习交流
        </footer>
      </body>
    </html>
  );
}
