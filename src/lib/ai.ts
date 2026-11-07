import { cloud } from "./cloud";
import { buildUserPrompt, SYSTEM_PROMPT } from "./prompt";
import { parseInterpretationJSON, scoreInterpretation } from "./quality";
import type { Audience, Style, Work } from "./types";

export interface GenerationResult {
  content: string; // 原始输出
  parsed: ReturnType<typeof parseInterpretationJSON>;
  score: number;
  issues: string[];
  model: string;
}

// 获取可用模型列表（空列表由调用方处理）
export async function listModels() {
  return cloud.llm.models.list();
}

// 生成一条解读：全流程 = LLM 调用 → JSON 解析 → 质量评分
export async function generateInterpretation(
  work: Work,
  style: Style,
  audience: Audience,
  modelId: string
): Promise<GenerationResult> {
  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: buildUserPrompt(work, style, audience) },
  ] as const;

  let answer = "";
  for await (const chunk of cloud.llm.chat.completions.create({
    model: modelId,
    messages: messages as unknown as Array<{
      role: "system" | "user";
      content: string;
    }>,
    stream: true,
    temperature: 0.8,
  })) {
    const delta = chunk.choices[0]?.delta;
    if (delta?.content) {
      answer += delta.content;
    }
  }

  const parsed = parseInterpretationJSON(answer);
  const { score, issues } = scoreInterpretation(parsed);

  return { content: answer, parsed, score, issues, model: modelId };
}
