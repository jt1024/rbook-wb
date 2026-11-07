"use client";

import { useEffect, useState } from "react";
import { adminWrite } from "@/lib/adminDb";
import { listAudiences, listStyles } from "@/lib/queries";
import type { Audience, Style } from "@/lib/types";

export default function DictionariesPage() {
  const [styles, setStyles] = useState<Style[]>([]);
  const [audiences, setAudiences] = useState<Audience[]>([]);
  const [editingStyle, setEditingStyle] = useState<number | null>(null);
  const [editingAudience, setEditingAudience] = useState<number | null>(null);
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(true);

  const reload = async () => {
    setStyles(await listStyles());
    setAudiences(await listAudiences());
    setLoading(false);
  };

  useEffect(() => {
    reload();
  }, []);

  const saveStyle = async (s: Style) => {
    const { error } = await adminWrite({
      table: "styles",
      op: "update",
      data: { name: s.name, description: s.description, prompt_template: s.prompt_template },
      match: { id: s.id },
    });
    setMsg(error ? `保存失败：${error}` : `已更新「${s.name}」。`);
    if (!error) setEditingStyle(null);
    reload();
  };

  const saveAudience = async (a: Audience) => {
    const { error } = await adminWrite({
      table: "audiences",
      op: "update",
      data: { name: a.name, description: a.description, prompt_suffix: a.prompt_suffix },
      match: { id: a.id },
    });
    setMsg(error ? `保存失败：${error}` : `已更新「${a.name}」。`);
    if (!error) setEditingAudience(null);
    reload();
  };

  const addStyle = async () => {
    const name = prompt("新风格的名称（如：汪曾祺体）：");
    if (!name) return;
    const slug = `style-${Date.now().toString(36)}`;
    const { error } = await adminWrite({
      table: "styles",
      op: "insert",
      data: {
        slug,
        name,
        description: "（请补充描述）",
        prompt_template: "你是____（请在此填写该解读人格的语气、视角与语言特征设定）。你的解读……",
        sort_order: styles.length + 1,
      },
    });
    setMsg(error ? `新增失败：${error}` : `已新增风格「${name}」，请编辑其提示词模板。`);
    reload();
  };

  const addAudience = async () => {
    const name = prompt("新人群的名称（如：职场新人）：");
    if (!name) return;
    const slug = `aud-${Date.now().toString(36)}`;
    const { error } = await adminWrite({
      table: "audiences",
      op: "insert",
      data: {
        slug,
        name,
        description: "（请补充描述）",
        prompt_suffix: "读者是____：（请填写该人群的阅读场景与语言要求）",
        sort_order: audiences.length + 1,
      },
    });
    setMsg(error ? `新增失败：${error}` : `已新增人群「${name}」，请编辑其受众侧写。`);
    reload();
  };

  const ta =
    "w-full px-3 py-2 rounded-md border border-[var(--border)] bg-[var(--card)] text-sm outline-none focus:border-[var(--accent)]";

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-2">
        <h1 className="font-serif-read text-2xl font-bold">风格与人群</h1>
        <div className="flex gap-2 text-sm">
          <button
            onClick={addStyle}
            className="px-3 py-1.5 rounded-md border border-[var(--border)] hover:border-[var(--accent)]"
          >
            + 新增风格
          </button>
          <button
            onClick={addAudience}
            className="px-3 py-1.5 rounded-md border border-[var(--border)] hover:border-[var(--accent)]"
          >
            + 新增人群
          </button>
        </div>
      </div>
      <p className="text-xs text-[var(--muted)] mb-6">
        风格提示词与受众侧写直接决定 AI 解读的口吻——修改后即时生效，下次生成即用新模板。
      </p>

      {msg && (
        <p className="mb-4 text-sm px-4 py-2 rounded-md bg-[var(--card)] border border-[var(--border)]">
          {msg}
        </p>
      )}
      {loading && <p className="text-[var(--muted)]">加载中…</p>}

      {/* 解读风格 */}
      <h2 className="text-sm text-[var(--muted)] mb-3">解读风格（{styles.length}）</h2>
      <div className="space-y-3 mb-10">
        {styles.map((s) => (
          <div key={s.id} className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4">
            {editingStyle === s.id ? (
              <div className="space-y-3">
                <input
                  value={s.name}
                  onChange={(e) => setStyles(styles.map((x) => (x.id === s.id ? { ...x, name: e.target.value } : x)))}
                  className={ta}
                />
                <input
                  value={s.description ?? ""}
                  onChange={(e) =>
                    setStyles(styles.map((x) => (x.id === s.id ? { ...x, description: e.target.value } : x)))
                  }
                  placeholder="一句话描述"
                  className={ta}
                />
                <textarea
                  value={s.prompt_template}
                  onChange={(e) =>
                    setStyles(styles.map((x) => (x.id === s.id ? { ...x, prompt_template: e.target.value } : x)))
                  }
                  rows={6}
                  className={`${ta} font-mono text-xs`}
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => saveStyle(s)}
                    className="px-4 py-1.5 rounded-md bg-[var(--accent)] text-white text-sm"
                  >
                    保存
                  </button>
                  <button
                    onClick={() => setEditingStyle(null)}
                    className="px-4 py-1.5 rounded-md border border-[var(--border)] text-sm"
                  >
                    取消
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-medium">{s.name}</div>
                  <div className="text-xs text-[var(--muted)] mt-0.5">{s.description}</div>
                </div>
                <button
                  onClick={() => setEditingStyle(s.id)}
                  className="px-3 py-1.5 rounded border border-[var(--border)] text-xs hover:border-[var(--accent)] shrink-0"
                >
                  编辑提示词
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* 读者人群 */}
      <h2 className="text-sm text-[var(--muted)] mb-3">读者人群（{audiences.length}）</h2>
      <div className="space-y-3">
        {audiences.map((a) => (
          <div key={a.id} className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4">
            {editingAudience === a.id ? (
              <div className="space-y-3">
                <input
                  value={a.name}
                  onChange={(e) =>
                    setAudiences(audiences.map((x) => (x.id === a.id ? { ...x, name: e.target.value } : x)))
                  }
                  className={ta}
                />
                <textarea
                  value={a.prompt_suffix ?? ""}
                  onChange={(e) =>
                    setAudiences(audiences.map((x) => (x.id === a.id ? { ...x, prompt_suffix: e.target.value } : x)))
                  }
                  rows={4}
                  className={`${ta} font-mono text-xs`}
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => saveAudience(a)}
                    className="px-4 py-1.5 rounded-md bg-[var(--accent)] text-white text-sm"
                  >
                    保存
                  </button>
                  <button
                    onClick={() => setEditingAudience(null)}
                    className="px-4 py-1.5 rounded-md border border-[var(--border)] text-sm"
                  >
                    取消
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-medium">{a.name}</div>
                  <div className="text-xs text-[var(--muted)] mt-0.5 line-clamp-1">
                    {a.prompt_suffix}
                  </div>
                </div>
                <button
                  onClick={() => setEditingAudience(a.id)}
                  className="px-3 py-1.5 rounded border border-[var(--border)] text-xs hover:border-[var(--accent)] shrink-0"
                >
                  编辑侧写
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
