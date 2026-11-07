import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/adminSession";
import * as db from "@/lib/serverQueries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 只读代理：前端只能指定「查什么」，不能携带任意表/任意 SQL。
// 匿名访问一律强制只看已发布内容；登录态下才开放草稿、任务记录等后台数据。
const PUBLIC_OPS = new Set([
  "listStyles",
  "listAudiences",
  "listWorks",
  "getWorkBySlug",
  "getWorkById",
  "listInterpretations",
  "getInterpretationById",
]);
const ADMIN_OPS = new Set(["listGenerationJobs"]);

type Args = Record<string, unknown>;

function str(args: Args, key: string, max = 200): string {
  const v = args[key];
  return typeof v === "string" ? v.slice(0, max) : "";
}
function int(args: Args, key: string): number {
  const v = args[key];
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}
function opts(args: Args) {
  return {
    status: str(args, "status", 40) || undefined,
    category: str(args, "category", 80) || undefined,
    q: str(args, "q", 100) || undefined,
    limit: int(args, "limit") || undefined,
    workId: int(args, "workId") || undefined,
    styleId: int(args, "styleId") || undefined,
    audienceId: int(args, "audienceId") || undefined,
  };
}

export async function POST(req: Request) {
  let body: { op?: unknown; args?: unknown };
  try {
    body = (await req.json()) as { op?: unknown; args?: unknown };
  } catch {
    return NextResponse.json({ error: "请求格式不正确" }, { status: 400 });
  }
  const op = typeof body.op === "string" ? body.op : "";
  const args: Args =
    body.args && typeof body.args === "object" && !Array.isArray(body.args)
      ? (body.args as Args)
      : {};

  if (!PUBLIC_OPS.has(op) && !ADMIN_OPS.has(op)) {
    return NextResponse.json({ error: "不支持的查询操作" }, { status: 400 });
  }

  const store = await cookies();
  const admin = verifySession(store.get(SESSION_COOKIE)?.value);
  if (ADMIN_OPS.has(op) && !admin) {
    return NextResponse.json({ error: "登录已失效，请重新登录" }, { status: 401 });
  }

  try {
    let data: unknown;
    switch (op) {
      case "listStyles":
        data = await db.listStyles();
        break;
      case "listAudiences":
        data = await db.listAudiences();
        break;
      case "listWorks": {
        const o = opts(args);
        // 匿名强制只看已发布作品，忽略前端传入的 status
        data = admin
          ? await db.listWorks(o)
          : await db.listWorks({ ...o, status: "published" });
        break;
      }
      case "getWorkBySlug": {
        const w = await db.getWorkBySlug(str(args, "slug", 200));
        data = w && (admin || w.status === "published") ? w : null;
        break;
      }
      case "getWorkById": {
        const id = int(args, "id");
        const w = id ? await db.getWorkById(id) : null;
        // 解读详情页会用它取「所属作品」，匿名只允许拿到已发布作品
        data = w && (admin || w.status === "published") ? w : null;
        break;
      }
      case "listInterpretations": {
        const o = opts(args);
        const list = admin
          ? await db.listInterpretations(o)
          : await db.listInterpretations({ ...o, status: "published" });
        if (admin) {
          data = list;
        } else {
          // 避免「已发布解读挂在草稿作品上」导致前台出现孤儿内容
          const publishedWorks = await db.listWorks({ status: "published" });
          const ids = new Set(publishedWorks.map((w) => w.id));
          data = list.filter((i) => ids.has(i.work_id));
        }
        break;
      }
      case "getInterpretationById": {
        const id = int(args, "id");
        const i = id ? await db.getInterpretationById(id) : null;
        if (!i || (!admin && i.status !== "published")) {
          data = null;
        } else if (admin) {
          data = i;
        } else {
          const w = await db.getWorkById(i.work_id);
          data = w?.status === "published" ? i : null;
        }
        break;
      }
      case "listGenerationJobs":
        data = await db.listGenerationJobs(int(args, "limit") || 20);
        break;
      default:
        return NextResponse.json({ error: "不支持的查询操作" }, { status: 400 });
    }
    return NextResponse.json({ data }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[api/data]", op, e);
    return NextResponse.json(
      { error: (e as Error).message ?? "查询失败" },
      { status: 500 }
    );
  }
}
