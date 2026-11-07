import { NextResponse } from "next/server";
import { clientKey, rateLimit, requireAdmin } from "@/lib/aiGuard";
import { searchWorkMeta } from "@/lib/aiSearch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "登录已失效，请重新登录" }, { status: 401 });
  }
  if (!rateLimit(clientKey(req, "ai-search"), 20, 60_000)) {
    return NextResponse.json({ error: "检索请求过于频繁，请稍后再试" }, { status: 429 });
  }

  let body: { title?: unknown };
  try {
    body = (await req.json()) as { title?: unknown };
  } catch {
    return NextResponse.json({ error: "请求格式不正确" }, { status: 400 });
  }
  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!title || title.length > 80) {
    return NextResponse.json({ error: "请输入 1-80 字的作品名" }, { status: 400 });
  }

  try {
    const outcome = await searchWorkMeta(title);
    return NextResponse.json(outcome);
  } catch (e) {
    console.error("[api/ai/search]", e);
    return NextResponse.json(
      { error: (e as Error).message ?? "检索失败" },
      { status: 500 }
    );
  }
}
