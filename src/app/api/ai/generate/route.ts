import { NextResponse } from "next/server";
import { clientKey, rateLimit, requireAdmin } from "@/lib/aiGuard";
import { generateInterpretation } from "@/lib/ai";
import type { Audience, Style, Work } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

interface GenerateBody {
  work?: unknown;
  style?: unknown;
  audience?: unknown;
  modelId?: unknown;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

export async function POST(req: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "登录已失效，请重新登录" }, { status: 401 });
  }
  if (!rateLimit(clientKey(req, "ai-generate"), 30, 60_000)) {
    return NextResponse.json({ error: "生成请求过于频繁，请稍后再试" }, { status: 429 });
  }

  let body: GenerateBody;
  try {
    body = (await req.json()) as GenerateBody;
  } catch {
    return NextResponse.json({ error: "请求格式不正确" }, { status: 400 });
  }
  if (
    !isRecord(body.work) ||
    !isRecord(body.style) ||
    !isRecord(body.audience) ||
    typeof body.modelId !== "string" ||
    !body.modelId.trim()
  ) {
    return NextResponse.json({ error: "缺少作品 / 风格 / 受众 / 模型参数" }, { status: 400 });
  }

  const requested = body.modelId.trim().slice(0, 120);
  // 长 JSON 输出偶发格式破损/截断；失败时用便宜模型重试一次，避免整次生成白等。
  const attempts = Array.from(new Set([requested, "glm-5.3-flash"])).slice(0, 2);
  let lastError = "";
  for (const modelId of attempts) {
    try {
      const result = await generateInterpretation(
        body.work as unknown as Work,
        body.style as unknown as Style,
        body.audience as unknown as Audience,
        modelId
      );
      return NextResponse.json(result);
    } catch (e) {
      lastError = (e as Error).message ?? "生成失败";
      console.error("[api/ai/generate]", modelId, "失败：", lastError);
    }
  }
  return NextResponse.json(
    { error: `生成失败（已重试）：${lastError}` },
    { status: 500 }
  );
}
