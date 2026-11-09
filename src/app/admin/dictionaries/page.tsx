"use client";

import { useEffect, useState } from "react";
import { dictWrite, listAllAudiences, listAllStyles } from "@/lib/queries";
import type { Audience, Style } from "@/lib/types";

type Kind = "style" | "audience";

// 删除确认弹窗状态：目标条目 + 管理员密码 + 删除模式
interface DeleteTarget {
  kind: Kind;
  id: number;
  name: string;
  count: number;
}

export default function DictionariesPage() {
  const [styles, setStyles] = useState<Style[]>([]);
  const [audiences, setAudiences] = useState<Audience[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [editingStyle, setEditingStyle] = useState<number | null>(null);
  const [editingAudience, setEditingAudience] = useState<number | null>(null);
  const [adding, setAdding] = useState<Kind | null>(null);
  const [draftName, setDraftName] = useState("");
  const [draftDesc, setDraftDesc] = useState("");
  const [draftTemplate, setDraftTemplate] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [deleteMode, setDeleteMode] = useState<"style_only" | "with_content">("style_only");
  const [deletePassword, setDeletePassword] = useState("");
  const [msg, setMsg] = useState("");
  const [msgError, setMsgError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const reload = async () => {
    const [s, a] = await Promise.all([listAllStyles(), listAllAudiences()]);
    setStyles(s);
    setAudiences(a);
    setLoading(false);
  };

  useEffect(() => {
    void reload();
    fetch("/api/admin/session", { cache: "no-store" })
      .then((r) => r.json())
      .then((d: { ok?: boolean; user?: { role?: string } }) => {
        const role = d.user?.role;
        setCanManage(d.ok === true && (role === "owner" || role === "admin"));
      })
      .catch(() => setCanManage(false));
  }, []);

  const flash = (text: string, error = false) => {
    setMsg(text);
    setMsgError(error);
    if (text) setTimeout(() => setMsg(""), 6000);
  };

  const guard = (): boolean => {
    if (!canManage) {
      flash("只有管理员可以管理风格与人群", true);
      return false;
    }
    return true;
  };

  const openAdd = (kind: Kind) => {
    if (!guard()) return;
    setAdding(kind);
    setDraftName("");
    setDraftDesc("");
    setDraftTemplate("");
  };

  const submitAdd = async () => {
    if (!adding) return;
    const name = draftName.trim();
    if (!name) {
      flash("名称不能为空", true);
      return;
    }
    setBusy(true);
    const kind = adding;
    const { error } = await dictWrite({
      action: "create",
      kind,
      name,
      description: draftDesc.trim(),
      ...(kind === "style"
        ? { prompt_template: draftTemplate }
        : { prompt_suffix: draftTemplate }),
    });
    setBusy(false);
    if (error) {
      flash(`新增失败：${error}`, true);
      return;
    }
    setAdding(null);
    flash(`已新增「${name}」，请完善提示词模板。`);
    reload();
  };

  const saveStyle = async (s: Style) => {
    const { error } = await dictWrite({
      action: "update",
      kind: "style",
      id: s.id,
      name: s.name,
      description: s.description ?? "",
      prompt_template: s.prompt_template,
    });
    if (error) {
      flash(`保存失败：${error}`, true);
      return;
    }
    setEditingStyle(null);
    flash(`已更新「${s.name}」。`);
    reload();
  };

  const saveAudience = async (a: Audience) => {
    const { error } = await dictWrite({
      action: "update",
      kind: "audience",
      id: a.id,
      name: a.name,
      description: a.description ?? "",
      prompt_suffix: a.prompt_suffix ?? "",
    });
    if (error) {
      flash(`保存失败：${error}`, true);
      return;
    }
    setEditingAudience(null);
    flash(`已更新「${a.name}」。`);
    reload();
  };

  const setActive = async (kind: Kind, id: number, name: string, isActive: boolean) => {
    if (!guard()) return;
    setBusy(true);
    const { error } = await dictWrite({ action: "set_active", kind, id, is_active: isActive });
    setBusy(false);
    if (error) {
      flash(`${isActive ? "启用" : "停用"}失败：${error}`, true);
      return;
    }
    if (!isActive) {
      flash(
        `已停用「${name}」：前台与生成入口不再展示该风格，关联解读同步隐藏；随时可重新启用。`
      );
    } else {
      flash(`已启用「${name}」，关联解读恢复展示。`);
    }
    reload();
  };

  const openDelete = (kind: Kind, item: Style | Audience) => {
    if (!guard()) return;
    setDeleteTarget({
      kind,
      id: item.id,
      name: item.name,
      count: item.interpretation_count ?? 0,
    });
    setDeleteMode("style_only");
    setDeletePassword("");
  };

  const submitDelete = async () => {
    if (!deleteTarget) return;
    if (!deletePassword.trim()) {
      flash("请输入管理员密码以确认删除", true);
      return;
    }
    setBusy(true);
    const { error } = await dictWrite({
      action: "delete",
      kind: deleteTarget.kind,
      id: deleteTarget.id,
      password: deletePassword.trim(),
      mode: deleteMode,
    });
    setBusy(false);
    if (error) {
      flash(`删除失败：${error}`, true);
      return;
    }
    const withContent = deleteMode === "with_content";
    flash(
      withContent
        ? `已删除「${deleteTarget.name}」及其 ${deleteTarget.count} 条关联解读。`
        : `已删除「${deleteTarget.name}」（软删除，${deleteTarget.count} 条关联解读保留但不再展示）。`
    );
    setDeleteTarget(null);
    setDeletePassword("");
    reload();
  };

  const ta =
    "w-full px-3 py-2 rounded-md border border-[var(--border)] bg-[var(--card)] text-sm outline-none focus:border-[var(--accent)]";
  const btn =
    "px-3 py-1.5 rounded border border-[var(--border)] text-xs hover:border-[var(--accent)] shrink-0 disabled:opacity-50";

  const renderCard = (kind: Kind, item: Style | Audience) => {
    const editing = kind === "style" ? editingStyle === item.id : editingAudience === item.id;
    const active = item.is_active !== false;
    const isStyle = "prompt_template" in item;
    const template = isStyle ? item.prompt_template : (item.prompt_suffix ?? "");
    const count = item.interpretation_count ?? 0;

    return (
      <div
        key={item.id}
        className={`rounded-lg border bg-[var(--card)] p-4 ${
          active ? "border-[var(--border)]" : "border-dashed border-[var(--border)] opacity-75"
        }`}
      >
        {editing ? (
          <div className="space-y-3">
            <input
              value={item.name}
              onChange={(e) => {
                const v = e.target.value;
                if (kind === "style") {
                  setStyles(styles.map((x) => (x.id === item.id ? { ...x, name: v } : x)));
                } else {
                  setAudiences(audiences.map((x) => (x.id === item.id ? { ...x, name: v } : x)));
                }
              }}
              className={ta}
            />
            <input
              value={item.description ?? ""}
              onChange={(e) => {
                const v = e.target.value;
                if (kind === "style") {
                  setStyles(
                    styles.map((x) => (x.id === item.id ? { ...x, description: v } : x))
                  );
                } else {
                  setAudiences(
                    audiences.map((x) => (x.id === item.id ? { ...x, description: v } : x))
                  );
                }
              }}
              placeholder="一句话描述"
              className={ta}
            />
            <textarea
              value={template}
              onChange={(e) => {
                const v = e.target.value;
                if (kind === "style") {
                  setStyles(
                    styles.map((x) => (x.id === item.id ? { ...x, prompt_template: v } : x))
                  );
                } else {
                  setAudiences(
                    audiences.map((x) => (x.id === item.id ? { ...x, prompt_suffix: v } : x))
                  );
                }
              }}
              rows={6}
              className={`${ta} font-mono text-xs`}
            />
            <div className="flex gap-2">
              <button
                onClick={() => {
                  if (isStyle) void saveStyle(item);
                  else void saveAudience(item);
                }}
                disabled={busy}
                className="px-4 py-1.5 rounded-md bg-[var(--accent)] text-white text-sm disabled:opacity-50"
              >
                保存
              </button>
              <button
                onClick={() =>
                  kind === "style" ? setEditingStyle(null) : setEditingAudience(null)
                }
                className="px-4 py-1.5 rounded-md border border-[var(--border)] text-sm"
              >
                取消
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium">{item.name}</span>
                <span
                  className={`px-1.5 py-0.5 rounded text-[10px] ${
                    active
                      ? "bg-green-100 text-green-700"
                      : "bg-yellow-100 text-yellow-700"
                  }`}
                >
                  {active ? "启用中" : "已停用"}
                </span>
                <span className="px-1.5 py-0.5 rounded text-[10px] bg-[var(--muted)]/10 text-[var(--muted)]">
                  {count} 条解读
                </span>
              </div>
              <div className="text-xs text-[var(--muted)] mt-0.5">{item.description}</div>
            </div>
            {canManage && (
              <div className="flex flex-col gap-1.5 shrink-0">
                <div className="flex gap-1.5">
                  <button
                    onClick={() =>
                      kind === "style" ? setEditingStyle(item.id) : setEditingAudience(item.id)
                    }
                    className={btn}
                  >
                    编辑提示词
                  </button>
                  <button
                    onClick={() => void setActive(kind, item.id, item.name, !active)}
                    disabled={busy}
                    className={btn}
                  >
                    {active ? "停用" : "启用"}
                  </button>
                </div>
                {!active && (
                  <button
                    onClick={() => openDelete(kind, item)}
                    disabled={busy}
                    className={`${btn} text-red-600 hover:border-red-400`}
                  >
                    删除
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-2">
        <h1 className="font-serif-read text-2xl font-bold">风格与人群</h1>
        {canManage && (
          <div className="flex gap-2 text-sm">
            <button
              onClick={() => openAdd("style")}
              className="px-3 py-1.5 rounded-md border border-[var(--border)] hover:border-[var(--accent)]"
            >
              + 新增风格
            </button>
            <button
              onClick={() => openAdd("audience")}
              className="px-3 py-1.5 rounded-md border border-[var(--border)] hover:border-[var(--accent)]"
            >
              + 新增人群
            </button>
          </div>
        )}
      </div>
      <p className="text-xs text-[var(--muted)] mb-6">
        风格提示词与受众侧写直接决定 AI 解读的口吻——修改后即时生效，下次生成即用新模板。
        停用的风格前台不再展示、关联解读同步隐藏；只有已停用的条目可以删除。
      </p>

      {msg && (
        <p
          className={`mb-4 text-sm px-4 py-2 rounded-md border ${
            msgError
              ? "bg-red-50 border-red-300 text-red-700"
              : "bg-[var(--card)] border-[var(--border)]"
          }`}
        >
          {msg}
        </p>
      )}
      {loading && <p className="text-[var(--muted)]">加载中…</p>}
      {!canManage && !loading && (
        <p className="mb-4 text-xs text-[var(--muted)]">
          当前账号为「编辑」角色，只能查看；风格与人群的管理需要管理员权限。
        </p>
      )}

      {/* 新增表单 */}
      {adding && (
        <div className="mb-8 rounded-lg border border-[var(--accent)] bg-[var(--card)] p-4 space-y-3">
          <h3 className="text-sm font-medium">
            新增{adding === "style" ? "风格" : "读者人群"}
          </h3>
          <input
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            placeholder={
              adding === "style" ? "风格名称（如：季羡林体）" : "人群名称（如：职场新人）"
            }
            className={ta}
          />
          <input
            value={draftDesc}
            onChange={(e) => setDraftDesc(e.target.value)}
            placeholder="一句话描述（可选）"
            className={ta}
          />
          <textarea
            value={draftTemplate}
            onChange={(e) => setDraftTemplate(e.target.value)}
            rows={6}
            placeholder={
              adding === "style"
                ? "提示词模板：描述该解读人格的语气、视角与语言特征（留空则使用占位模板）"
                : "受众侧写：描述该人群的阅读场景与语言要求（留空则使用占位模板）"
            }
            className={`${ta} font-mono text-xs`}
          />
          <div className="flex gap-2">
            <button
              onClick={() => void submitAdd()}
              disabled={busy}
              className="px-4 py-1.5 rounded-md bg-[var(--accent)] text-white text-sm disabled:opacity-50"
            >
              保存
            </button>
            <button
              onClick={() => setAdding(null)}
              className="px-4 py-1.5 rounded-md border border-[var(--border)] text-sm"
            >
              取消
            </button>
          </div>
        </div>
      )}

      {/* 解读风格 */}
      <h2 className="text-sm text-[var(--muted)] mb-3">解读风格（{styles.length}）</h2>
      <div className="space-y-3 mb-10">{styles.map((s) => renderCard("style", s))}</div>

      {/* 读者人群 */}
      <h2 className="text-sm text-[var(--muted)] mb-3">读者人群（{audiences.length}）</h2>
      <div className="space-y-3">{audiences.map((a) => renderCard("audience", a))}</div>

      {/* 删除确认弹窗 */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-lg border border-[var(--border)] bg-[var(--card)] p-6 space-y-4">
            <h3 className="text-base font-semibold text-red-600">删除「{deleteTarget.name}」</h3>
            <p className="text-sm text-[var(--muted)]">
              该{deleteTarget.kind === "style" ? "风格" : "人群"}下有{" "}
              <span className="font-medium text-[var(--fg)]">{deleteTarget.count}</span>{" "}
              条关联解读。请选择删除范围：
            </p>
            <div className="space-y-2 text-sm">
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="radio"
                  checked={deleteMode === "style_only"}
                  onChange={() => setDeleteMode("style_only")}
                  className="mt-1"
                />
                <span>
                  <span className="font-medium">仅删除{deleteTarget.kind === "style" ? "风格" : "人群"}</span>
                  <span className="block text-xs text-[var(--muted)] mt-0.5">
                    关联解读保留在数据库中，但前台与后台不再展示（软删除，最安全）
                  </span>
                </span>
              </label>
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="radio"
                  checked={deleteMode === "with_content"}
                  onChange={() => setDeleteMode("with_content")}
                  className="mt-1"
                />
                <span>
                  <span className="font-medium text-red-600">
                    连同 {deleteTarget.count} 条关联解读一起删除
                  </span>
                  <span className="block text-xs text-[var(--muted)] mt-0.5">
                    关联解读将被永久删除，不可恢复
                  </span>
                </span>
              </label>
            </div>
            <div>
              <label className="text-xs text-[var(--muted)] block mb-1">
                请输入当前账号（管理员）密码以确认：
              </label>
              <input
                type="password"
                value={deletePassword}
                onChange={(e) => setDeletePassword(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void submitDelete();
                }}
                autoFocus
                className={ta}
              />
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setDeleteTarget(null)}
                className="px-4 py-1.5 rounded-md border border-[var(--border)] text-sm"
              >
                取消
              </button>
              <button
                onClick={() => void submitDelete()}
                disabled={busy || !deletePassword.trim()}
                className="px-4 py-1.5 rounded-md bg-red-600 text-white text-sm disabled:opacity-50"
              >
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
