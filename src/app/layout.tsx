import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "经典解读 · 把经典读出味道来",
    template: "%s | 经典解读",
  },
  description:
    "经典文章与书籍的人格化深读平台：同一篇经典，不同风格的解读，面向不同读者的深阅读体验。",
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
