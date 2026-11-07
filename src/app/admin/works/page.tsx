"use client";

import { useEffect, useState } from "react";
import { listWorks } from "@/lib/queries";
import { WORK_STATUS } from "@/lib/types";
import type { Work } from "@/lib/types";

export default function AdminWorksPage() {
  const [works, setWorks] = useState<Work[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");

  const reload = async () => {
    setWorks(await listWorks());
    setLoading(false);
  };

  useEffect(() => {
    reload();
  }, []);

  const toggleStatus = async (w: Work) => {
    const next = w.status === "published" ? "draft" : "published";
    const { cloud } = await import("@/lib/cloud");
    const { error } = await cloud.database
      .from("works")
      .update({ status: next, updated_at: new Date().toISOString() })
      .eq("id", w.id);
    if (error) {
      setMsg(`操作失败：${(error as Error).message}`);
    } else {
      setMsg(`已将《${w.title}》设为${WORK_STATUS[next]}`);
      reload();
    }
  };

  const remove = async (w: Work) => {
    if (!confirm(`确认删除《${w.title}》及其全部解读？该操作不可恢复。`)) return;
    const { cloud } = await import("@/lib/cloud");
    const { error } = await cloud.database.from("works").delete().eq("id", w.id);
    if (error) {
      setMsg(`删除失败：${(error as Error).message}`);
    } else {
      setMsg(`已删除《${w.title}》`);
      reload();
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-serif-read text-2xl font-bold">作品管理</h1>
        <a
          href="/admin/works/new"
          className="px-4 py-2 rounded-md bg-[var(--accent)] text-white text-sm"
        >
          + 录入/导入作品
        </a>
      </div>

      {msg && (
        <p className="mb-4 text-sm px-4 py-2 rounded-md bg-[var(--card)] border border-[var(--border)]">
          {msg}
        </p>
      )}

      {loading && <p className="text-[var(--muted)]">加载中…</p>}
      {!loading && works.length === 0 && (
        <p className="text-sm text-[var(--muted)]">还没有作品，点击右上角录入第一部经典。</p>
      )}

      <div className="space-y-3">
        {works.map((w) => (
          <div
            key={w.id}
            className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border)] bg-[var(--card)] px-4 py-3"
          >
            <div className="min-w-0">
              <div className="font-medium truncate">
                《{w.title}》
                <span className="ml-2 text-xs text-[var(--muted)]">
                  {w.author ?? "佚名"} · {w.category ?? "未分类"}
                </span>
              </div>
              <div className="text-xs text-[var(--muted)] mt-0.5">
                状态：
                <span
                  className={
                    w.status === "published" ? "text-green-700" : "text-[var(--muted)]"
                  }
                >
                  {WORK_STATUS[w.status] ?? w.status}
                </span>
                {w.source_type === "fetched" && " · 检索导入"}
              </div>
            </div>
            <div className="flex gap-2 shrink-0 text-xs">
              <a
                href={`/admin/works/${w.id}/edit`}
                className="px-3 py-1.5 rounded border border-[var(--border)] hover:border-[var(--accent)]"
              >
                编辑
              </a>
              <button
                onClick={() => toggleStatus(w)}
                className="px-3 py-1.5 rounded border border-[var(--border)] hover:border-[var(--accent)]"
              >
                {w.status === "published" ? "转草稿" : "发布"}
              </button>
              <button
                onClick={() => remove(w)}
                className="px-3 py-1.5 rounded border border-red-200 text-red-600 hover:bg-red-50"
              >
                删除
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
