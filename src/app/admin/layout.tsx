"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

interface SessionUser {
  user_id: number;
  username: string;
  display_name: string;
  role: "owner" | "admin" | "editor";
}

const ROLE_LABELS: Record<string, string> = {
  owner: "超级管理员",
  admin: "管理员",
  editor: "编辑",
};

// 登录态完全由服务端会话决定：浏览器只持有 httpOnly cookie，
// 密码哈希与账号数据从不出现在前端 bundle 里。
export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // 初始恒为 null / checking=true，保证 SSR 与客户端首帧一致，避免 hydration 不匹配。
  const [user, setUser] = useState<SessionUser | null>(null);
  const [checking, setChecking] = useState(true);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch("/api/admin/session")
      .then((r) => r.json())
      .then((j: { ok?: boolean; user?: SessionUser }) => {
        if (alive) setUser(j.ok ? j.user ?? null : null);
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
    if (!username.trim() || !password || pending) return;
    setPending(true);
    setError("");
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const json = (await res.json()) as { error?: string; user?: SessionUser };
      if (res.ok && json.user) {
        setUser(json.user);
        setPassword("");
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
    setUser(null);
    setUsername("");
    setPassword("");
  };

  if (checking) {
    return (
      <div className="max-w-sm mx-auto px-4 py-24 text-center text-sm text-[var(--muted)]">
        正在检查登录状态…
      </div>
    );
  }

  if (!user) {
    return (
      <div className="max-w-sm mx-auto px-4 py-24">
        <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-8">
          <h1 className="font-serif-read text-xl font-bold text-center mb-2">
            后台管理
          </h1>
          <p className="text-center text-xs text-[var(--muted)] mb-6">
            请使用管理员账号登录
          </p>
          <div className="space-y-3">
            <input
              type="text"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="用户名"
              disabled={pending}
              className="w-full px-3 py-2 rounded-md border border-[var(--border)] text-sm outline-none focus:border-[var(--accent)]"
            />
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void login();
              }}
              placeholder="密码"
              disabled={pending}
              className="w-full px-3 py-2 rounded-md border border-[var(--border)] text-sm outline-none focus:border-[var(--accent)]"
            />
          </div>
          {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
          <button
            onClick={() => void login()}
            disabled={pending || !username.trim() || !password}
            className="mt-4 w-full py-2 rounded-md bg-[var(--foreground)] text-[var(--background)] text-sm disabled:opacity-60"
          >
            {pending ? "登录中…" : "进入后台"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <AdminShell user={user} onLogout={logout}>
      {children}
    </AdminShell>
  );
}

function AdminShell({
  children,
  user,
  onLogout,
}: {
  children: React.ReactNode;
  user: SessionUser;
  onLogout: () => void;
}) {
  const pathname = usePathname();
  const items = [
    { href: "/admin", label: "概览" },
    { href: "/admin/works", label: "作品管理" },
    { href: "/admin/generate", label: "解读生成" },
    { href: "/admin/review", label: "审核发布" },
    { href: "/admin/dictionaries", label: "风格与人群" },
    { href: "/admin/accounts", label: "账号与会话" },
  ];

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <span className="text-sm text-[var(--muted)]">
          当前账号：<strong className="text-[var(--foreground)]">{user.display_name || user.username}</strong>
          <span className="ml-1 text-xs">（{user.username}）</span>
        </span>
        <span className="px-2 py-0.5 rounded-full border border-[var(--border)] text-xs text-[var(--muted)]">
          {ROLE_LABELS[user.role] ?? user.role}
        </span>
        <button
          onClick={onLogout}
          className="ml-auto px-3 py-1.5 rounded-md border border-[var(--border)] text-xs text-[var(--muted)] hover:border-[var(--accent)]"
        >
          退出登录
        </button>
      </div>
      <nav className="flex flex-wrap items-center gap-2 mb-8">
        {items.map((it) => {
          const active =
            it.href === "/admin"
              ? pathname === "/admin"
              : pathname === it.href || pathname.startsWith(it.href + "/");
          return (
            <a
              key={it.href}
              href={it.href}
              className={`px-3 py-1.5 rounded-md text-sm ${
                active
                  ? "bg-[var(--foreground)] text-[var(--background)]"
                  : "text-[var(--muted)] hover:bg-[var(--card)]"
              }`}
            >
              {it.label}
            </a>
          );
        })}
      </nav>
      {children}
    </div>
  );
}
