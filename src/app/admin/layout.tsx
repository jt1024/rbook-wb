"use client";

import { useEffect, useState } from "react";

// 后台登录走服务端校验：口令只在 .env.local，浏览器只拿到 httpOnly 会话 cookie。
export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // 初始恒为 false / checking=true，保证 SSR 与客户端首帧一致，避免 hydration 不匹配。
  const [ok, setOk] = useState(false);
  const [checking, setChecking] = useState(true);
  const [input, setInput] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch("/api/admin/session")
      .then((r) => r.json())
      .then((j) => {
        if (alive) setOk(Boolean(j.ok));
      })
      .catch(() => {})
      .finally(() => {
        if (alive) setChecking(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const login = async () => {
    if (!input.trim() || pending) return;
    setPending(true);
    setError("");
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: input }),
      });
      const json = (await res.json()) as { error?: string };
      if (res.ok) {
        setOk(true);
        setInput("");
      } else {
        setError(json.error ?? "登录失败，请重试。");
      }
    } catch {
      setError("网络错误，请重试。");
    } finally {
      setPending(false);
    }
  };

  const logout = async () => {
    await fetch("/api/admin/logout", { method: "POST" }).catch(() => {});
    setOk(false);
  };

  if (checking) {
    return (
      <div className="max-w-sm mx-auto px-4 py-24 text-center text-sm text-[var(--muted)]">
        正在检查登录状态…
      </div>
    );
  }

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
              if (e.key === "Enter") void login();
            }}
            placeholder="请输入管理口令"
            disabled={pending}
            className="w-full px-3 py-2 rounded-md border border-[var(--border)] text-sm outline-none focus:border-[var(--accent)]"
          />
          {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
          <button
            onClick={() => void login()}
            disabled={pending}
            className="mt-4 w-full py-2 rounded-md bg-[var(--foreground)] text-[var(--background)] text-sm disabled:opacity-60"
          >
            {pending ? "登录中…" : "进入后台"}
          </button>
        </div>
      </div>
    );
  }

  return <AdminShell onLogout={logout}>{children}</AdminShell>;
}

function AdminShell({
  children,
  onLogout,
}: {
  children: React.ReactNode;
  onLogout: () => void;
}) {
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
      <nav className="flex flex-wrap items-center gap-2 mb-8">
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
        <button
          onClick={onLogout}
          className="ml-auto px-3 py-1.5 rounded-md border border-[var(--border)] text-xs text-[var(--muted)] hover:border-[var(--accent)]"
        >
          退出登录
        </button>
      </nav>
      {children}
    </div>
  );
}
