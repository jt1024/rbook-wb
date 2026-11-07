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

/**
 * 修复 LLM 常见的「看起来像 JSON、但严格解析会失败」问题：
 *  - 字符串里出现裸换行 / 制表符
 *  - 中文正文里出现未转义的半角引号（会把字符串提前闭合）
 *  - 尾随逗号
 *  - 流式输出被截断，缺少收尾的 } / ]
 */
function repairJson(text: string): string {
  let out = "";
  let inString = false;
  let escaped = false;
  let braces = 0;
  let brackets = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) {
        out += ch;
        escaped = false;
        continue;
      }
      if (ch === "\\") {
        out += ch;
        escaped = true;
        continue;
      }
      if (ch === "\n") { out += "\\n"; continue; }
      if (ch === "\r") { out += "\\r"; continue; }
      if (ch === "\t") { out += "\\t"; continue; }
      if (ch === '"') {
        // 后面紧跟结构字符才算字符串结束；否则视为正文里的引号并转义
        const next = text.slice(i + 1).trimStart()[0] ?? "";
        if (next && ",:}]".includes(next)) {
          out += ch;
          inString = false;
        } else {
          out += '\\"';
        }
        continue;
      }
      out += ch;
      continue;
    }
    if (ch === '"') {
      inString = true;
      out += ch;
    } else {
      if (ch === "{") braces++;
      else if (ch === "}") braces--;
      else if (ch === "[") brackets++;
      else if (ch === "]") brackets--;
      out += ch;
    }
  }
  if (inString) {
    if (escaped) out = out.slice(0, -1);
    out += '"';
  }
  out += "]".repeat(Math.max(0, brackets));
  out += "}".repeat(Math.max(0, braces));
  return out.replace(/,\s*([}\]])/g, "$1");
}

/** 模型偶尔会漏写属性之间的逗号：在「值结束后换行、下一行是新键」处补一个逗号。 */
function insertMissingCommas(text: string): string {
  return text.replace(/("|\}|\])\s*\n(\s*"[^"\n]+"\s*:)/g, "$1,\n$2");
}

// 从 LLM 返回文本中解析 JSON（容错处理代码围栏、前后杂文与格式破损）
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

  // 逐级放宽：原样 → 修复裸引号/裸换行/截断 → 再补漏掉的逗号
  const candidates = [
    text,
    repairJson(text),
    repairJson(insertMissingCommas(text)),
    insertMissingCommas(repairJson(text)),
  ];
  let parsed: InterpretationContent | null = null;
  let lastError = "";
  for (const candidate of candidates) {
    try {
      parsed = JSON.parse(candidate) as InterpretationContent;
      break;
    } catch (e) {
      lastError = (e as Error).message;
    }
  }
  if (!parsed || typeof parsed !== "object") {
    throw new Error(`LLM 输出不是合法 JSON：${lastError}`);
  }
  return {
    summary: parsed.summary ?? "",
    background: parsed.background ?? "",
    sections: parsed.sections ?? [],
    highlights: parsed.highlights ?? [],
    reading_list: parsed.reading_list ?? [],
  };
}
