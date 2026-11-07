"use client";

import { useEffect, useState } from "react";
import { generateInterpretation, listModels } from "@/lib/ai";
import { cloud } from "@/lib/cloud";
import { listAudiences, listStyles, listWorks } from "@/lib/queries";
import type { Audience, Style, Work } from "@/lib/types";

interface ModelItem {
  id: string;
  name?: string;
  disabled?: boolean;
}

export default function GeneratePage() {
  const [works, setWorks] = useState<Work[]>([]);
  const [styles, setStyles] = useState<Style[]>([]);
  const [audiences, setAudiences] = useState<Audience[]>([]);
  const [models, setModels] = useState<ModelItem[]>([]);

  const [workId, setWorkId] = useState<number | null>(null);
  const [styleId, setStyleId] = useState<number | null>(null);
  const [audienceId, setAudienceId] = useState<number | null>(null);
  const [modelId, setModelId] = useState<string>("");

  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState("");
  const [result, setResult] = useState<string>("");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    (async () => {
      const [ws, ss, as] = await Promise.all([
        listWorks(),
        listStyles(),
        listAudiences(),
      ]);
      setWorks(ws);
      setStyles(ss);
      setAudiences(as);
      try {
        const ms = await listModels();
        const usable = (ms as ModelItem[]).filter((m) => m.disabled !== true);
        setModels(usable);
        if (usable[0]) setModelId(usable[0].id);
        else setMsg("当前环境没有可用模型，请联系管理员检查模型目录。");
      } catch (e) {
        setMsg(`模型列表获取失败：${(e as Error).message}`);
      }
    })();
  }, []);

  const run = async () => {
    if (!workId || !styleId || !audienceId || !modelId) {
      setMsg("请先完整选择：作品 × 风格 × 读者 × 模型。");
      return;
    }
    const work = works.find((w) => w.id === workId);
    const style = styles.find((s) => s.id === styleId);
    const audience = audiences.find((a) => a.id === audienceId);
    if (!work || !style || !audience) return;

    setRunning(true);
    setMsg("");
    setResult("");
    setProgress("创建生成任务…");

    let jobId: number | null = null;
    try {
      // 1. 落一条任务记录
      const { data, error } = await cloud.database
        .from("generation_jobs")
        .insert({
          work_id: work.id,
          style_id: style.id,
          audience_id: audience.id,
          model: modelId,
          status: "running",
          started_at: new Date().toISOString(),
        })
        .select();
      if (error) throw new Error(`任务创建失败：${(error as Error).message}`);
      jobId = (Array.isArray(data) ? (data[0] as { id: number }) : null)?.id ?? null;

      // 2. 调用 LLM 生成
      setProgress(`正在以「${style.name}」的口吻解读《${work.title}》…（约需 1-2 分钟）`);
      const res = await generateInterpretation(work, style, audience, modelId);

      // 3. 质量校验后落库为待审核
      setProgress(`生成完成，质量评分 ${res.score} 分，正在保存…`);
      const { error: saveErr } = await cloud.database
        .from("interpretations")
        .insert({
          work_id: work.id,
          style_id: style.id,
          audience_id: audience.id,
          title: `${style.name}谈《${work.title}》`,
          summary: res.parsed.summary,
          structured_content: res.parsed,
          generation_type: "ai",
          ai_model: res.model,
          quality_score: res.score,
          status: "pending_review",
        });
      if (saveErr) throw new Error(`解读保存失败：${(saveErr as Error).message}`);

      // 4. 更新任务状态
      if (jobId) {
        await cloud.database
          .from("generation_jobs")
          .update({
            status: "success",
            finished_at: new Date().toISOString(),
          })
          .eq("id", jobId);
      }

      setProgress("");
      setResult(
        `完成！评分 ${res.score}/100${res.issues.length ? `；提示：${res.issues.join("；")}` : "，未发现结构问题"}。已进入审核队列。`
      );
    } catch (e) {
      const errMsg = (e as Error).message ?? String(e);
      setMsg(`生成失败：${errMsg}`);
      if (jobId) {
        await cloud.database
          .from("generation_jobs")
          .update({
            status: "failed",
            error: errMsg.slice(0, 500),
            finished_at: new Date().toISOString(),
            retry_count: 1,
          })
          .eq("id", jobId);
      }
    } finally {
      setRunning(false);
    }
  };

  const selectCls =
    "w-full px-3 py-2 rounded-md border border-[var(--border)] bg-[var(--card)] text-sm outline-none focus:border-[var(--accent)]";

  return (
    <div className="max-w-2xl">
      <h1 className="font-serif-read text-2xl font-bold mb-2">生成解读</h1>
      <p className="text-sm text-[var(--muted)] mb-6">
        选择一部作品、一种解读风格与目标读者，AI 将以对应人格撰写结构化解读。
      </p>

      <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-6 space-y-4">
        <label className="block text-xs text-[var(--muted)]">作品</label>
        <select
          value={workId ?? ""}
          onChange={(e) => setWorkId(Number(e.target.value) || null)}
          className={selectCls}
        >
          <option value="">— 选择作品 —</option>
          {works.map((w) => (
            <option key={w.id} value={w.id}>
              《{w.title}》{w.author ? `（${w.author}）` : ""}
            </option>
          ))}
        </select>

        <label className="block text-xs text-[var(--muted)]">解读风格</label>
        <div className="grid grid-cols-3 gap-2">
          {styles.map((s) => (
            <button
              key={s.id}
              onClick={() => setStyleId(s.id)}
              className={`px-3 py-2 rounded-md text-sm border transition-colors ${
                styleId === s.id
                  ? "bg-[var(--accent)] text-white border-transparent"
                  : "border-[var(--border)] hover:border-[var(--accent)]"
              }`}
            >
              {s.name}
            </button>
          ))}
        </div>

        <label className="block text-xs text-[var(--muted)]">目标读者</label>
        <div className="grid grid-cols-5 gap-2">
          {audiences.map((a) => (
            <button
              key={a.id}
              onClick={() => setAudienceId(a.id)}
              className={`px-2 py-2 rounded-md text-sm border transition-colors ${
                audienceId === a.id
                  ? "bg-[var(--accent)] text-white border-transparent"
                  : "border-[var(--border)] hover:border-[var(--accent)]"
              }`}
            >
              {a.name}
            </button>
          ))}
        </div>

        <label className="block text-xs text-[var(--muted)]">生成模型</label>
        <select
          value={modelId}
          onChange={(e) => setModelId(e.target.value)}
          className={selectCls}
        >
          {models.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name ?? m.id}
            </option>
          ))}
        </select>

        {msg && <p className="text-xs text-red-600">{msg}</p>}
        {progress && <p className="text-xs text-[var(--accent)]">{progress}</p>}
        {result && (
          <p className="text-xs px-3 py-2 rounded-md bg-green-50 text-green-800 border border-green-200">
            {result}
          </p>
        )}

        <button
          onClick={run}
          disabled={running}
          className="w-full py-2.5 rounded-md bg-[var(--accent)] text-white text-sm disabled:opacity-50"
        >
          {running ? "生成中…" : "开始生成"}
        </button>
      </div>
    </div>
  );
}
