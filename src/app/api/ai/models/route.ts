import { NextResponse } from "next/server";
import { clientKey, rateLimit, requireAdmin } from "@/lib/aiGuard";
import { listModels } from "@/lib/ai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "登录已失效，请重新登录" }, { status: 401 });
  }
  if (!rateLimit(clientKey(req, "ai-models"), 60, 60_000)) {
    return NextResponse.json({ error: "请求过于频繁，请稍后再试" }, { status: 429 });
  }
  try {
    const ms = await listModels();
    const models = (
      ms as Array<{ id: string; name?: string; disabled?: boolean }>
    ).map((m) => ({ id: m.id, name: m.name, disabled: m.disabled }));
    return NextResponse.json({ models });
  } catch (e) {
    console.error("[api/ai/models]", e);
    return NextResponse.json(
      { error: (e as Error).message ?? "模型列表获取失败" },
      { status: 500 }
    );
  }
}
