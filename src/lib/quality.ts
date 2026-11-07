import type { InterpretationContent } from "./types";

// 敏感词粗筛表（可运营期继续扩充）
const SENSITIVE_WORDS = [
  "习近平", "毛泽东", "六四", "法轮功", "达赖", "台独", "港独",
];

export interface QualityResult {
  score: number; // 0-100
  issues: string[];
}

function checkSensitive(text: string, issues: string[]): boolean {
  const hit = SENSITIVE_WORDS.filter((w) => text.includes(w));
  if (hit.length > 0) {
    issues.push(`包含敏感词：${hit.join("、")}`);
    return false;
  }
  return true;
}

// 结构完整性 + 内容质量评分
export function scoreInterpretation(
  content: InterpretationContent
): QualityResult {
  const issues: string[] = [];
  let score = 100;

  if (!content.summary || content.summary.length < 10) {
    issues.push("summary 缺失或过短");
    score -= 15;
  }

  if (!content.background || content.background.length < 80) {
    issues.push("background 背景介绍过短（应≥80字）");
    score -= 10;
  }

  const sections = content.sections ?? [];
  if (sections.length < 3 || sections.length > 10) {
    issues.push(`sections 数量 ${sections.length} 不在 3-10 范围`);
    score -= 20;
  }
  const thinSections = sections.filter(
    (s) => !s.quote || !s.comment || s.comment.length < 60
  );
  if (thinSections.length > 0) {
    issues.push(`${thinSections.length} 个段落解读过短（<60字）`);
    score -= Math.min(20, thinSections.length * 5);
  }

  const highlights = content.highlights ?? [];
  if (highlights.length < 3) {
    issues.push("highlights 不足 3 条");
    score -= 10;
  }

  const readingList = content.reading_list ?? [];
  if (readingList.length < 2) {
    issues.push("reading_list 不足 2 本");
    score -= 10;
  }

  const allText = JSON.stringify(content);
  if (!checkSensitive(allText, issues)) {
    score -= 100; // 敏感词一票否决
  }

  return { score: Math.max(0, Math.min(100, score)), issues };
}

// 从 LLM 返回文本中解析 JSON（容错处理代码围栏与前后杂文）
export function parseInterpretationJSON(raw: string): InterpretationContent {
  let text = raw.trim();
  // 去掉 ```json ... ``` 围栏
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) {
    text = fence[1].trim();
  }
  // 截取第一个 { 到最后一个 } 之间内容
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) {
    text = text.slice(start, end + 1);
  }
  const parsed = JSON.parse(text) as InterpretationContent;
  return {
    summary: parsed.summary ?? "",
    background: parsed.background ?? "",
    sections: parsed.sections ?? [],
    highlights: parsed.highlights ?? [],
    reading_list: parsed.reading_list ?? [],
  };
}
