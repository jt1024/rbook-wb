import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/adminSession";
import { cloud } from "@/lib/cloud";

export const runtime = "nodejs";

// 写操作白名单：前端只能描述「改哪张表、哪种操作」，不能携带任意 SQL。
const TABLES = new Set([
  "works",
  "styles",
  "audiences",
  "interpretations",
  "generation_jobs",
]);
const OPS = new Set(["insert", "update", "delete"]);

interface WriteRequest {
  table?: unknown;
  op?: unknown;
  data?: unknown;
  match?: unknown;
}

export async function POST(req: Request) {
  const store = await cookies();
  if (!verifySession(store.get(SESSION_COOKIE)?.value)) {
    return NextResponse.json({ error: "登录已失效，请重新登录" }, { status: 401 });
  }

  const secret = process.env.ADMIN_DB_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "服务端未配置 ADMIN_DB_SECRET" }, { status: 500 });
  }

  let body: WriteRequest;
  try {
    body = (await req.json()) as WriteRequest;
  } catch {
    return NextResponse.json({ error: "请求格式不正确" }, { status: 400 });
  }
  const table = String(body.table ?? "");
  const op = String(body.op ?? "");
  if (!TABLES.has(table) || !OPS.has(op)) {
    return NextResponse.json({ error: "不允许的表或操作" }, { status: 400 });
  }
  if (!body.data || typeof body.data !== "object" || Array.isArray(body.data)) {
    return NextResponse.json({ error: "缺少写入数据" }, { status: 400 });
  }
  const match =
    body.match && typeof body.match === "object" && !Array.isArray(body.match)
      ? body.match
      : {};

  try {
    const result = (await cloud.database.rpc("admin_write", {
      p_secret: secret,
      p_table: table,
      p_op: op,
      p_data: body.data,
      p_match: match,
    })) as { data: unknown; error: { message?: string } | null };
    if (result.error) {
      const message = result.error?.message ?? String(result.error);
      return NextResponse.json({ error: message }, { status: 500 });
    }
    return NextResponse.json({ data: Array.isArray(result.data) ? result.data : [] });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message ?? "写入失败" },
      { status: 500 }
    );
  }
}
