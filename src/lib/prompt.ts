import type { Audience, Style, Work } from "./types";

// 系统提示：固定的角色与输出格式约束（所有生成调用共用）
export const SYSTEM_PROMPT = `你是「经典解读」网站的资深撰稿人。请严格按照用户指定的人格与语气，为指定作品撰写一篇结构化解读。

输出必须是且仅是一个 JSON 对象（禁止输出 markdown 代码围栏或任何多余文字），结构如下：
{
  "summary": "全文概括，60字以内",
  "background": "作者与时代背景介绍，150-250字",
  "sections": [
    { "quote": "原文关键句或段落（保持原文原样，不改写）", "comment": "对该段的精读解读，200-400字" }
  ],
  "highlights": ["值得摘抄的金句，优先取自原文"],
  "reading_list": [ { "title": "延伸阅读书名", "reason": "一句话推荐理由" } ]
}

数量要求：sections 5-8 段；highlights 3-5 条；reading_list 3 本。
所有文字使用简体中文。直接输出 JSON。`;

// 组装用户提示词：风格人格模板 + 受众侧写 + 作品信息与原文
export function buildUserPrompt(
  work: Work,
  style: Style,
  audience: Audience
): string {
  const parts: string[] = [];

  parts.push(`【解读人格设定】\n${style.prompt_template}`);

  if (audience.prompt_suffix) {
    parts.push(`【读者侧写】\n${audience.prompt_suffix}`);
  }

  parts.push(
    `【作品信息】\n标题：《${work.title}》\n作者：${work.author ?? "不详"}${
      work.era ? `（${work.era}）` : ""
    }\n类别：${work.category ?? "未分类"}\n简介：${work.intro ?? "无"}`
  );

  parts.push(`【原文】\n${work.content ?? "（原文未提供，请基于你的知识撰写解读，quote 字段可引用你所知的原文）"}`);

  parts.push(
    `请以「${style.name}」的口吻、面向「${audience.name}」读者，输出结构化解读 JSON。`
  );

  return parts.join("\n\n");
}
