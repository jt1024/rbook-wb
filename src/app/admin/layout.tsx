"use client";

import { useEffect, useState } from "react";

// MVP 简易门控：口令存 sessionStorage。二期接入正式登录体系后替换。
const ADMIN_KEY = "classic-insight-admin";
const ADMIN_PASSWORD = "REDACTED";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // 初始恒为 false，保证服务端与客户端首帧渲染一致（避免 hydration 不匹配）；
  // 挂载后再读取 sessionStorage 恢复登录态。
  const [ok, setOk] = useState(false);
  const [input, setInput] = useState("");
  const [error, setError] = useState(false);

  useEffect(() => {
    if (sessionStorage.getItem(ADMIN_KEY) === "1") {
      setOk(true);
    }
  }, []);

  if (!ok) {
    return (
      <div className="max-w-sm mx-auto px-4 py-24">
        <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-8">
          <h1 className="font-serif-read text-xl font-bold text-center mb-6">
            后台管理
          </h1>
          <input
            type="password"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                if (input === ADMIN_PASSWORD) {
                  sessionStorage.setItem(ADMIN_KEY, "1");
                  setOk(true);
                } else {
                  setError(true);
                }
              }
            }}
            placeholder="请输入管理口令"
            className="w-full px-3 py-2 rounded-md border border-[var(--border)] text-sm outline-none focus:border-[var(--accent)]"
          />
          {error && (
            <p className="mt-2 text-xs text-red-600">口令不正确，请重试。</p>
          )}
          <button
            onClick={() => {
              if (input === ADMIN_PASSWORD) {
                sessionStorage.setItem(ADMIN_KEY, "1");
                setOk(true);
              } else {
                setError(true);
              }
            }}
            className="mt-4 w-full py-2 rounded-md bg-[var(--foreground)] text-[var(--background)] text-sm"
          >
            进入后台
          </button>
        </div>
      </div>
    );
  }

  return <AdminShell>{children}</AdminShell>;
}

function AdminShell({ children }: { children: React.ReactNode }) {
  const [tab, setTab] = useState<string>("");

  const items = [
    { href: "/admin", label: "概览" },
    { href: "/admin/works", label: "作品管理" },
    { href: "/admin/generate", label: "解读生成" },
    { href: "/admin/review", label: "审核发布" },
    { href: "/admin/dictionaries", label: "风格与人群" },
  ];

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <nav className="flex flex-wrap gap-2 mb-8">
        {items.map((it) => (
          <a
            key={it.href}
            href={it.href}
            onClick={() => setTab(it.href)}
            className={`px-3 py-1.5 rounded-md text-sm ${
              tab === it.href
                ? "bg-[var(--foreground)] text-[var(--background)]"
                : "text-[var(--muted)] hover:bg-[var(--card)]"
            }`}
          >
            {it.label}
          </a>
        ))}
      </nav>
      {children}
    </div>
  );
}
