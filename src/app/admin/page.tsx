"use client";

import { useEffect, useState } from "react";
import { listGenerationJobs, listInterpretations, listWorks } from "@/lib/queries";
import { JOB_STATUS } from "@/lib/types";

export default function AdminDashboard() {
  const [stats, setStats] = useState({
    works: 0,
    published: 0,
    interps: 0,
    pending: 0,
  });
  const [jobs, setJobs] = useState<Array<Record<string, unknown>>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [ws, is, js] = await Promise.all([
        listWorks(),
        listInterpretations(),
        listGenerationJobs(10),
      ]);
      setStats({
        works: ws.length,
        published: ws.filter((w) => w.status === "published").length,
        interps: is.length,
        pending: is.filter((i) => i.status === "pending_review").length,
      });
      setJobs(js);
      setLoading(false);
    })();
  }, []);

  const cards = [
    { label: "作品总数", value: stats.works, sub: `已发布 ${stats.published}` },
    { label: "解读总数", value: stats.interps, sub: `待审核 ${stats.pending}` },
  ];

  return (
    <div>
      <h1 className="font-serif-read text-2xl font-bold mb-6">概览</h1>
      {loading && <p className="text-[var(--muted)]">加载中…</p>}

      <div className="grid grid-cols-2 gap-4 mb-8">
        {cards.map((c) => (
          <div
            key={c.label}
            className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-5"
          >
            <div className="text-xs text-[var(--muted)]">{c.label}</div>
            <div className="text-3xl font-bold mt-1">{c.value}</div>
            <div className="text-xs text-[var(--muted)] mt-1">{c.sub}</div>
          </div>
        ))}
      </div>

      <h2 className="text-sm text-[var(--muted)] mb-3">最近的生成任务</h2>
      {jobs.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">暂无任务记录。</p>
      ) : (
        <div className="rounded-lg border border-[var(--border)] divide-y divide-[var(--border)] overflow-hidden">
          {jobs.map((j) => (
            <div
              key={String(j.id)}
              className="flex items-center justify-between px-4 py-3 text-sm bg-[var(--card)]"
            >
              <span>
                任务 #{String(j.id)} · 作品 {String(j.work_id)}
              </span>
              <span
                className={
                  j.status === "failed"
                    ? "text-red-600"
                    : j.status === "success"
                      ? "text-green-700"
                      : "text-[var(--muted)]"
                }
              >
                {JOB_STATUS[String(j.status)] ?? String(j.status)}
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="mt-8 flex gap-3">
        <a
          href="/admin/works/new"
          className="px-4 py-2 rounded-md bg-[var(--accent)] text-white text-sm"
        >
          + 录入/导入作品
        </a>
        <a
          href="/admin/generate"
          className="px-4 py-2 rounded-md border border-[var(--border)] text-sm hover:border-[var(--accent)]"
        >
          ✦ 生成解读
        </a>
      </div>
    </div>
  );
}
