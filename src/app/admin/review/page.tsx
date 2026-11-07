"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { cloud } from "@/lib/cloud";
import { listAudiences, listInterpretations, listStyles, listWorks } from "@/lib/queries";
import { INTERP_STATUS, formatBookTitle } from "@/lib/types";
import type { Audience, Interpretation, Style, Work } from "@/lib/types";

const TABS = [
  { key: "pending_review", label: "待审核" },
  { key: "published", label: "已发布" },
  { key: "rejected", label: "未通过" },
];

// 编辑表单通用输入框样式
const editField =
  "w-full px-3 py-2 rounded-md border border-[var(--border)] bg-[var(--background)] text-sm outline-none focus:border-[var(--accent)]";

// 结构化编辑表单：普通文本框编辑，保存时再序列化回 structured_content
interface EditForm {
  summary: string;
  background: string;
  sections: { quote: string; comment: string }[];
  highlights: string; // 每行一条
  books: { title: string; reason: string }[];
}

// 从 structured_content 构建编辑表单（对缺字段做容错）
function toEditForm(c: Interpretation["structured_content"]): EditForm {
  return {
    summary: c?.summary ?? "",
    background: c?.background ?? "",
    sections: (c?.sections ?? []).map((s) => ({
      quote: s?.quote ?? "",
      comment: s?.comment ?? "",
    })),
    highlights: (c?.highlights ?? []).join("\n"),
    books: (c?.reading_list ?? []).map((b) => ({
      title: b?.title ?? "",
      reason: b?.reason ?? "",
    })),
  };
}

export default function ReviewPage() {
  const [tab, setTab] = useState("pending_review");
  const [interps, setInterps] = useState<Interpretation[]>([]);
  const [works, setWorks] = useState<Work[]>([]);
  const [styles, setStyles] = useState<Style[]>([]);
  const [audiences, setAudiences] = useState<Audience[]>([]);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [editing, setEditing] = useState<number | null>(null);
  const [form, setForm] = useState<EditForm | null>(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");

  const reload = async () => {
    const [is, ws, ss, as] = await Promise.all([
      listInterpretations(),
      listWorks(),
      listStyles(),
      listAudiences(),
    ]);
    setInterps(is);
    setWorks(ws);
    setStyles(ss);
    setAudiences(as);
    setLoading(false);
  };

  useEffect(() => {
    reload();
  }, []);

  const shown = interps.filter((i) => i.status === tab);

  const setStatus = async (i: Interpretation, status: string) => {
    const { error } = await cloud.database
      .from("interpretations")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", i.id);
    if (error) {
      setMsg(`操作失败：${(error as Error).message}`);
    } else {
      setMsg(status === "published" ? "已发布。" : status === "rejected" ? "已退回。" : "已转待审核。");
      reload();
    }
  };

  const saveEdit = async (i: Interpretation) => {
    if (!form) return;
    try {
      // 表单 → structured_content（与 AI 生成的数据结构保持一致）
      const content = {
        summary: form.summary.trim(),
        background: form.background.trim(),
        sections: form.sections
          .map((s) => ({ quote: s.quote.trim(), comment: s.comment.trim() }))
          .filter((s) => s.quote || s.comment),
        highlights: form.highlights
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean),
        reading_list: form.books
          .map((b) => ({ title: b.title.trim(), reason: b.reason.trim() }))
          .filter((b) => b.title),
      };
      const { error } = await cloud.database
        .from("interpretations")
        .update({
          structured_content: content,
          summary: content.summary || i.summary,
          updated_at: new Date().toISOString(),
        })
        .eq("id", i.id);
      if (error) throw error;
      setMsg("内容已更新。");
      setEditing(null);
      reload();
    } catch (e) {
      setMsg(`保存失败：${(e as Error).message}`);
    }
  };

  const remove = async (i: Interpretation) => {
    if (!confirm("确认删除该解读？不可恢复。")) return;
    await cloud.database.from("interpretations").delete().eq("id", i.id);
    reload();
  };

  return (
    <div>
      <h1 className="font-serif-read text-2xl font-bold mb-6">审核发布</h1>

      <div className="flex gap-2 mb-4">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-3 py-1.5 rounded-full text-sm ${
              tab === t.key
                ? "bg-[var(--foreground)] text-[var(--background)]"
                : "text-[var(--muted)] border border-[var(--border)]"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {msg && (
        <p className="mb-4 text-sm px-4 py-2 rounded-md bg-[var(--card)] border border-[var(--border)]">
          {msg}
        </p>
      )}

      {loading && <p className="text-[var(--muted)]">加载中…</p>}
      {!loading && shown.length === 0 && (
        <p className="text-sm text-[var(--muted)]">该状态下暂无解读。</p>
      )}

      <div className="space-y-3">
        {shown.map((i) => {
          const w = works.find((x) => x.id === i.work_id);
          const st = styles.find((x) => x.id === i.style_id);
          const au = audiences.find((x) => x.id === i.audience_id);
          const c = i.structured_content;
          return (
            <div
              key={i.id}
              className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-medium truncate">
                    {i.title || "（无标题）"}
                    <span className="ml-2 text-xs text-[var(--muted)]">
                      《{w?.title ?? "?"}》· {st?.name ?? "?"} · 给{au?.name ?? "?"}
                    </span>
                  </div>
                  <div className="text-xs text-[var(--muted)] mt-1">
                    评分{" "}
                    <span
                      className={
                        (i.quality_score ?? 0) >= 85
                          ? "text-green-700"
                          : (i.quality_score ?? 0) >= 60
                            ? "text-amber-600"
                            : "text-red-600"
                      }
                    >
                      {i.quality_score ?? "-"}
                    </span>
                    /100 · {i.ai_model ?? "手动"} · {INTERP_STATUS[i.status]}
                  </div>
                </div>
                <div className="flex gap-2 shrink-0 text-xs">
                  <button
                    onClick={() => setExpanded(expanded === i.id ? null : i.id)}
                    className="px-3 py-1.5 rounded border border-[var(--border)] hover:border-[var(--accent)]"
                  >
                    {expanded === i.id ? "收起" : "查看"}
                  </button>
                  {i.status !== "published" && (
                    <button
                      onClick={() => setStatus(i, "published")}
                      className="px-3 py-1.5 rounded bg-green-700 text-white"
                    >
                      发布
                    </button>
                  )}
                  {i.status === "pending_review" && (
                    <button
                      onClick={() => setStatus(i, "rejected")}
                      className="px-3 py-1.5 rounded border border-red-200 text-red-600 hover:bg-red-50"
                    >
                      退回
                    </button>
                  )}
                  <button
                    onClick={() => {
                      if (editing === i.id) {
                        setEditing(null);
                      } else {
                        setEditing(i.id);
                        setForm(toEditForm(c));
                      }
                    }}
                    className="px-3 py-1.5 rounded border border-[var(--border)] hover:border-[var(--accent)]"
                  >
                    编辑
                  </button>
                  <button
                    onClick={() => remove(i)}
                    className="px-3 py-1.5 rounded border border-red-200 text-red-600 hover:bg-red-50"
                  >
                    删除
                  </button>
                </div>
              </div>

              {expanded === i.id && c && (
                <div className="mt-4 border-t border-[var(--border)] pt-4 text-sm space-y-3 max-h-96 overflow-y-auto">
                  <p className="text-[var(--muted)]">
                    <strong>摘要：</strong>
                    {c.summary}
                  </p>
                  <p className="text-[var(--muted)]">
                    <strong>背景：</strong>
                    {c.background}
                  </p>
                  {c.sections.map((s, idx) => (
                    <div key={idx}>
                      <p className="font-serif-read">「{s.quote}」</p>
                      <p className="text-[var(--muted)] whitespace-pre-wrap">{s.comment}</p>
                    </div>
                  ))}
                  <p className="text-[var(--muted)]">
                    <strong>金句：</strong>
                    {c.highlights.join(" / ")}
                  </p>
                  <p className="text-[var(--muted)]">
                    <strong>书单：</strong>
                    {c.reading_list.map((b) => formatBookTitle(b.title)).join("、")}
                  </p>
                  {i.status === "published" && (
                    <Link
                      href={`/interpretations/${i.id}`}
                      className="inline-block text-[var(--accent)] hover:underline"
                    >
                      在前台查看 →
                    </Link>
                  )}
                </div>
              )}

              {editing === i.id && form && (
                <div className="mt-4 border-t border-[var(--border)] pt-4 space-y-4 text-sm">
                  <div>
                    <label className="block text-xs text-[var(--muted)] mb-1">摘要</label>
                    <textarea
                      value={form.summary}
                      onChange={(e) => setForm({ ...form, summary: e.target.value })}
                      rows={2}
                      className={editField}
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-[var(--muted)] mb-1">背景介绍</label>
                    <textarea
                      value={form.background}
                      onChange={(e) => setForm({ ...form, background: e.target.value })}
                      rows={3}
                      className={editField}
                    />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs text-[var(--muted)]">逐段精读（{form.sections.length} 段）</label>
                      <button
                        onClick={() =>
                          setForm({
                            ...form,
                            sections: [...form.sections, { quote: "", comment: "" }],
                          })
                        }
                        className="text-xs text-[var(--accent)] hover:underline"
                      >
                        + 添加段落
                      </button>
                    </div>
                    <div className="space-y-3">
                      {form.sections.map((s, idx) => (
                        <div key={idx} className="rounded-md border border-[var(--border)] p-3 space-y-2">
                          <div className="flex gap-2">
                            <input
                              value={s.quote}
                              onChange={(e) => {
                                const sections = [...form.sections];
                                sections[idx] = { ...s, quote: e.target.value };
                                setForm({ ...form, sections });
                              }}
                              placeholder="原文引句"
                              className={editField}
                            />
                            <button
                              onClick={() =>
                                setForm({
                                  ...form,
                                  sections: form.sections.filter((_, j) => j !== idx),
                                })
                              }
                              className="shrink-0 px-2 text-xs text-red-600 hover:underline"
                            >
                              删除
                            </button>
                          </div>
                          <textarea
                            value={s.comment}
                            onChange={(e) => {
                              const sections = [...form.sections];
                              sections[idx] = { ...s, comment: e.target.value };
                              setForm({ ...form, sections });
                            }}
                            placeholder="解读评注"
                            rows={3}
                            className={editField}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs text-[var(--muted)] mb-1">
                      金句（每行一条）
                    </label>
                    <textarea
                      value={form.highlights}
                      onChange={(e) => setForm({ ...form, highlights: e.target.value })}
                      rows={4}
                      className={editField}
                    />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs text-[var(--muted)]">延伸书单（{form.books.length} 本）</label>
                      <button
                        onClick={() =>
                          setForm({
                            ...form,
                            books: [...form.books, { title: "", reason: "" }],
                          })
                        }
                        className="text-xs text-[var(--accent)] hover:underline"
                      >
                        + 添加书目
                      </button>
                    </div>
                    <div className="space-y-2">
                      {form.books.map((b, idx) => (
                        <div key={idx} className="flex gap-2">
                          <input
                            value={b.title}
                            onChange={(e) => {
                              const books = [...form.books];
                              books[idx] = { ...b, title: e.target.value };
                              setForm({ ...form, books });
                            }}
                            placeholder="书名（无需书名号）"
                            className={editField}
                          />
                          <input
                            value={b.reason}
                            onChange={(e) => {
                              const books = [...form.books];
                              books[idx] = { ...b, reason: e.target.value };
                              setForm({ ...form, books });
                            }}
                            placeholder="一句话推荐理由"
                            className={editField}
                          />
                          <button
                            onClick={() =>
                              setForm({
                                ...form,
                                books: form.books.filter((_, j) => j !== idx),
                              })
                            }
                            className="shrink-0 px-2 text-xs text-red-600 hover:underline"
                          >
                            删除
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                  <button
                    onClick={() => saveEdit(i)}
                    className="px-4 py-2 rounded-md bg-[var(--accent)] text-white text-sm"
                  >
                    保存修改
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
