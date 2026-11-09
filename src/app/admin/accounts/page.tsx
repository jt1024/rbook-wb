"use client";

import { useCallback, useEffect, useState } from "react";

type Role = "owner" | "admin" | "editor";

interface AdminUser {
  id: number;
  username: string;
  display_name: string;
  role: Role;
  is_active: boolean;
  failed_attempts: number;
  locked_until: string | null;
  last_login_at: string | null;
  created_at: string;
}

interface SessionRecord {
  id: number;
  user_id: number;
  username: string;
  created_at: string;
  expires_at: string;
  last_seen_at: string;
  revoked_at: string | null;
  ip: string;
  user_agent: string;
  current: boolean;
}

interface Me {
  user_id: number;
  username: string;
  display_name: string;
  role: Role;
}

const ROLE_LABELS: Record<string, string> = {
  owner: "超级管理员",
  admin: "管理员",
  editor: "编辑",
};

function fmt(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleString("zh-CN", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
}

const inputCls =
  "w-full px-3 py-2 rounded-md border border-[var(--border)] bg-[var(--background)] text-sm outline-none focus:border-[var(--accent)]";
const btnCls =
  "px-3 py-1.5 rounded-md border border-[var(--border)] text-xs hover:border-[var(--accent)] disabled:opacity-50";

export default function AccountsPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const [createForm, setCreateForm] = useState({
    username: "",
    password: "",
    display_name: "",
    role: "editor" as Role,
  });
  const [pwdForm, setPwdForm] = useState({ old_password: "", new_password: "" });
  const [resetFor, setResetFor] = useState<number | null>(null);
  const [resetValue, setResetValue] = useState("");

  const load = useCallback(async () => {
    try {
      const [a, s] = await Promise.all([
        fetch("/api/admin/accounts").then((r) => r.json()),
        fetch("/api/admin/sessions").then((r) => r.json()),
      ]);
      setMe(a.me ?? null);
      setUsers(Array.isArray(a.users) ? a.users : []);
      setSessions(Array.isArray(s.sessions) ? s.sessions : []);
      if (a.error) setError(a.error);
    } catch {
      setError("数据加载失败，请刷新重试");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const relogin = useCallback(async () => {
    await fetch("/api/admin/logout", { method: "POST" }).catch(() => {});
    window.location.reload();
  }, []);

  const call = useCallback(
    async (
      url: string,
      payload: Record<string, unknown>,
      successMessage: string
    ): Promise<boolean> => {
      setBusy(true);
      setError("");
      setNotice("");
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const json = (await res.json()) as {
          error?: string;
          ok?: boolean;
          relogin?: boolean;
        };
        if (!res.ok || json.error) {
          setError(json.error ?? "操作失败");
          return false;
        }
        if (json.relogin) {
          await relogin();
          return true;
        }
        setNotice(successMessage);
        await load();
        return true;
      } catch {
        setError("网络错误，请重试");
        return false;
      } finally {
        setBusy(false);
      }
    },
    [load, relogin]
  );

  const createUser = async () => {
    const ok = await call(
      "/api/admin/accounts",
      { action: "create", ...createForm },
      "账号已创建"
    );
    if (ok) setCreateForm({ username: "", password: "", display_name: "", role: "editor" });
  };

  const changePassword = async () => {
    const ok = await call(
      "/api/admin/accounts",
      { action: "change_password", ...pwdForm },
      "密码已修改，请重新登录"
    );
    if (ok) setPwdForm({ old_password: "", new_password: "" });
  };

  const updateUser = (id: number, patch: Record<string, unknown>) =>
    call("/api/admin/accounts", { action: "update", user_id: id, ...patch }, "账号已更新");

  const activeSessions = sessions.filter((s) => !s.revoked_at);

  if (loading) {
    return <p className="text-sm text-[var(--muted)]">正在加载账号与会话…</p>;
  }

  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-serif-read text-2xl font-bold">账号与会话</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          多用户账号、角色权限与可即时吊销的服务端会话。密码以 scrypt + 独立盐值存储，数据库只保存会话令牌的哈希。
        </p>
      </header>

      {(notice || error) && (
        <div
          className={`rounded-md border px-4 py-3 text-sm ${
            error
              ? "border-red-300 bg-red-50 text-red-700"
              : "border-green-300 bg-green-50 text-green-700"
          }`}
        >
          {error || notice}
        </div>
      )}

      {/* 当前账号 */}
      <section className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-5">
        <h2 className="font-semibold text-base mb-3">当前账号</h2>
        <p className="text-sm text-[var(--muted)] mb-4">
          {me?.display_name || me?.username}（{me?.username}） · {ROLE_LABELS[me?.role ?? ""] ?? "—"}
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          <input
            type="password"
            autoComplete="current-password"
            placeholder="原密码"
            value={pwdForm.old_password}
            onChange={(e) => setPwdForm({ ...pwdForm, old_password: e.target.value })}
            className={inputCls}
          />
          <input
            type="password"
            autoComplete="new-password"
            placeholder="新密码（至少 10 位）"
            value={pwdForm.new_password}
            onChange={(e) => setPwdForm({ ...pwdForm, new_password: e.target.value })}
            className={inputCls}
          />
          <button
            onClick={() => void changePassword()}
            disabled={busy || !pwdForm.old_password || !pwdForm.new_password}
            className="px-4 py-2 rounded-md bg-[var(--foreground)] text-[var(--background)] text-sm disabled:opacity-50"
          >
            修改密码
          </button>
        </div>
        <p className="mt-2 text-xs text-[var(--muted)]">修改后会吊销该账号的全部会话，需要重新登录。</p>
      </section>

      {/* 账号管理（仅 owner） */}
      {me?.role === "owner" && (
        <section className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-5">
          <h2 className="font-semibold text-base mb-3">账号管理</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-[var(--muted)] border-b border-[var(--border)]">
                  <th className="py-2 pr-3">用户名</th>
                  <th className="py-2 pr-3">显示名</th>
                  <th className="py-2 pr-3">角色</th>
                  <th className="py-2 pr-3">状态</th>
                  <th className="py-2 pr-3">最近登录</th>
                  <th className="py-2">操作</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-b border-[var(--border)] last:border-0">
                    <td className="py-3 pr-3 font-mono text-xs">{u.username}</td>
                    <td className="py-3 pr-3">
                      <input
                        defaultValue={u.display_name}
                        key={`name-${u.id}-${u.display_name}`}
                        onBlur={(e) => {
                          const v = e.target.value.trim();
                          if (v && v !== u.display_name) void updateUser(u.id, { display_name: v });
                        }}
                        className="w-28 px-2 py-1 rounded border border-[var(--border)] bg-transparent text-xs"
                      />
                    </td>
                    <td className="py-3 pr-3">
                      <select
                        value={u.role}
                        disabled={busy}
                        onChange={(e) => void updateUser(u.id, { role: e.target.value })}
                        className="px-2 py-1 rounded border border-[var(--border)] bg-transparent text-xs"
                      >
                        <option value="owner">超级管理员</option>
                        <option value="admin">管理员</option>
                        <option value="editor">编辑</option>
                      </select>
                    </td>
                    <td className="py-3 pr-3">
                      <button
                        disabled={busy || u.id === me?.user_id}
                        onClick={() => void updateUser(u.id, { is_active: !u.is_active })}
                        className={`px-2 py-1 rounded text-xs border ${
                          u.is_active
                            ? "border-green-300 text-green-700"
                            : "border-gray-300 text-[var(--muted)]"
                        } disabled:opacity-50`}
                      >
                        {u.is_active ? "启用中" : "已停用"}
                      </button>
                    </td>
                    <td className="py-3 pr-3 text-xs text-[var(--muted)]">{fmt(u.last_login_at)}</td>
                    <td className="py-3">
                      <div className="flex gap-2">
                        <button
                          disabled={busy}
                          onClick={() => {
                            setResetFor(resetFor === u.id ? null : u.id);
                            setResetValue("");
                          }}
                          className={btnCls}
                        >
                          重置密码
                        </button>
                        <button
                          disabled={busy || u.id === me?.user_id}
                          onClick={() => {
                            if (window.confirm(`确定删除账号「${u.username}」？该操作不可恢复。`)) {
                              void call(
                                "/api/admin/accounts",
                                { action: "delete", user_id: u.id },
                                "账号已删除"
                              );
                            }
                          }}
                          className={btnCls}
                        >
                          删除
                        </button>
                      </div>
                      {resetFor === u.id && (
                        <div className="flex gap-2 mt-2">
                          <input
                            type="password"
                            placeholder="新密码（至少 10 位）"
                            value={resetValue}
                            onChange={(e) => setResetValue(e.target.value)}
                            className="w-48 px-2 py-1 rounded border border-[var(--border)] bg-transparent text-xs"
                          />
                          <button
                            disabled={busy || resetValue.length < 10}
                            onClick={() =>
                              void call(
                                "/api/admin/accounts",
                                { action: "set_password", user_id: u.id, password: resetValue },
                                "密码已重置"
                              ).then((ok) => {
                                if (ok) setResetFor(null);
                              })
                            }
                            className={btnCls}
                          >
                            确认
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-5 pt-5 border-t border-[var(--border)]">
            <h3 className="text-sm font-semibold mb-3">新建账号</h3>
            <div className="grid gap-3 sm:grid-cols-4">
              <input
                placeholder="用户名"
                value={createForm.username}
                onChange={(e) => setCreateForm({ ...createForm, username: e.target.value })}
                className={inputCls}
              />
              <input
                type="password"
                placeholder="初始密码（至少 10 位）"
                value={createForm.password}
                onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
                className={inputCls}
              />
              <input
                placeholder="显示名（可选）"
                value={createForm.display_name}
                onChange={(e) => setCreateForm({ ...createForm, display_name: e.target.value })}
                className={inputCls}
              />
              <div className="flex gap-2">
                <select
                  value={createForm.role}
                  onChange={(e) => setCreateForm({ ...createForm, role: e.target.value as Role })}
                  className="flex-1 px-2 rounded-md border border-[var(--border)] bg-[var(--background)] text-sm"
                >
                  <option value="editor">编辑</option>
                  <option value="admin">管理员</option>
                  <option value="owner">超级管理员</option>
                </select>
                <button
                  onClick={() => void createUser()}
                  disabled={busy || !createForm.username || createForm.password.length < 10}
                  className="px-4 rounded-md bg-[var(--foreground)] text-[var(--background)] text-sm disabled:opacity-50"
                >
                  创建
                </button>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* 会话 */}
      <section className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-5">
        <div className="flex flex-wrap items-center gap-3 mb-3">
          <h2 className="font-semibold text-base">登录会话</h2>
          <span className="text-xs text-[var(--muted)]">
            {activeSessions.length} 个有效 / 共 {sessions.length} 条
          </span>
          <div className="ml-auto flex gap-2">
            <button
              disabled={busy}
              onClick={() =>
                void call("/api/admin/sessions", { action: "revoke_all", scope: "mine" }, "已吊销本人全部会话")
              }
              className={btnCls}
            >
              吊销我的全部会话
            </button>
            {me?.role === "owner" && (
              <button
                disabled={busy}
                onClick={() => {
                  if (window.confirm("确定吊销所有账号的全部会话？所有人都需要重新登录。")) {
                    void call("/api/admin/sessions", { action: "revoke_all", scope: "all" }, "已吊销全部会话");
                  }
                }}
                className={btnCls}
              >
                吊销全部会话
              </button>
            )}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-[var(--muted)] border-b border-[var(--border)]">
                <th className="py-2 pr-3">账号</th>
                <th className="py-2 pr-3">登录时间</th>
                <th className="py-2 pr-3">最近活跃</th>
                <th className="py-2 pr-3">来源</th>
                <th className="py-2 pr-3">状态</th>
                <th className="py-2">操作</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => (
                <tr key={s.id} className="border-b border-[var(--border)] last:border-0">
                  <td className="py-3 pr-3 font-mono text-xs">
                    {s.username}
                    {s.current && <span className="ml-1 text-[var(--accent)]">（当前）</span>}
                  </td>
                  <td className="py-3 pr-3 text-xs">{fmt(s.created_at)}</td>
                  <td className="py-3 pr-3 text-xs">{fmt(s.last_seen_at)}</td>
                  <td className="py-3 pr-3 text-xs text-[var(--muted)]" title={s.user_agent}>
                    {s.ip || "—"} · {s.user_agent.slice(0, 24) || "—"}
                  </td>
                  <td className="py-3 pr-3 text-xs">
                    {s.revoked_at ? (
                      <span className="text-[var(--muted)]">已吊销</span>
                    ) : (
                      <span className="text-green-700">有效</span>
                    )}
                  </td>
                  <td className="py-3">
                    <button
                      disabled={busy || Boolean(s.revoked_at)}
                      onClick={() =>
                        void call(
                          "/api/admin/sessions",
                          { action: "revoke", session_id: s.id },
                          "会话已吊销"
                        )
                      }
                      className={btnCls}
                    >
                      吊销
                    </button>
                  </td>
                </tr>
              ))}
              {sessions.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-4 text-center text-xs text-[var(--muted)]">
                    暂无会话记录
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
