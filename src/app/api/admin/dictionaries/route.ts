import { NextResponse } from "next/server";
import { authRpc } from "@/lib/adminAuth";
import { requireAdmin } from "@/lib/adminSession";
import { cloud } from "@/lib/cloud";
import { verifyPassword } from "@/lib/password";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 风格与人群的管理入口：增、改、停用/启用、删除。
// 停用/启用与普通编辑要求 owner/admin；删除额外要求输入本账号密码二次确认，
// 且只允许删除「已停用」的条目。软删除（deleted_at）保证数据可追溯、防误删。

type Kind = "style" | "audience";

interface DictRequest {
  action?: unknown;
  kind?: unknown;
  id?: unknown;
  name?: unknown;
  description?: unknown;
  prompt_template?: unknown;
  prompt_suffix?: unknown;
  sort_order?: unknown;
  is_active?: unknown;
  password?: unknown;
  mode?: unknown;
}

const KINDS = new Set<Kind>(["style", "audience"]);

function bad(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

function str(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

function kindOf(v: unknown): Kind | null {
  return typeof v === "string" && KINDS.has(v as Kind) ? (v as Kind) : null;
}

function tableOf(kind: Kind): string {
  return kind === "style" ? "styles" : "audiences";
}

async function adminWrite(args: {
  table: string;
  op: string;
  data?: Record<string, unknown>;
  match?: Record<string, unknown>;
}): Promise<Array<Record<string, unknown>>> {
  const secret = process.env.ADMIN_DB_SECRET;
  if (!secret) throw new Error("服务端未配置 ADMIN_DB_SECRET");
  const result = (await cloud.database.rpc("admin_write", {
    p_secret: secret,
    p_table: args.table,
    p_op: args.op,
    p_data: args.data ?? {},
    p_match: args.match ?? {},
  })) as { data: unknown; error: { message?: string } | null };
  if (result.error) {
    throw new Error(result.error?.message ?? "写库失败");
  }
  return Array.isArray(result.data) ? result.data : [];
}

export async function POST(req: Request) {
  const ctx = await requireAdmin();
  if (!ctx) return bad("登录已失效，请重新登录", 401);
  if (ctx.role !== "owner" && ctx.role !== "admin") {
    return bad("只有管理员可以管理风格与人群", 403);
  }

  let body: DictRequest;
  try {
    body = (await req.json()) as DictRequest;
  } catch {
    return bad("请求格式不正确");
  }
  const action = String(body.action ?? "");
  const kind = kindOf(body.kind);
  if (action !== "create" && !kind) return bad("类型不合法");
  const table = kind ? tableOf(kind) : "";

  try {
    // 新增：名称必填，slug 自动生成；提示词模板给默认占位。
    if (action === "create") {
      const name = str(body.name, 60);
      if (!name) return bad("名称不能为空");
      const description = str(body.description, 200) || null;
      const template =
        str(body.prompt_template, 4000) ||
        str(body.prompt_suffix, 4000) ||
        "你是____（请在此填写该解读人格的语气、视角与语言特征设定）。你的解读……";
      const data =
        kind === "style"
          ? {
              slug: `style-${Date.now().toString(36)}`,
              name,
              description,
              prompt_template: template,
            }
          : {
              slug: `aud-${Date.now().toString(36)}`,
              name,
              description,
              prompt_suffix: template,
            };
      const rows = await adminWrite({ table, op: "insert", data });
      return NextResponse.json({ ok: true, id: rows[0]?.id ?? null });
    }

    const id = Number(body.id);
    if (!Number.isInteger(id) || id <= 0) return bad("缺少目标条目");

    // 停用/启用：不做删除，前台与生成入口联表过滤，重新启用即刻恢复。
    if (action === "set_active") {
      const isActive = body.is_active === true;
      await adminWrite({ table, op: "update", data: { is_active: isActive }, match: { id } });
      return NextResponse.json({ ok: true });
    }

    // 编辑基本信息与提示词模板。
    if (action === "update") {
      const data: Record<string, unknown> = {};
      const name = str(body.name, 60);
      if (name) data.name = name;
      if (body.description !== undefined) data.description = str(body.description, 200) || null;
      if (body.prompt_template !== undefined && kind === "style") {
        data.prompt_template = str(body.prompt_template, 4000);
      }
      if (body.prompt_suffix !== undefined && kind === "audience") {
        data.prompt_suffix = str(body.prompt_suffix, 4000);
      }
      const sortOrder = Number(body.sort_order);
      if (Number.isInteger(sortOrder) && sortOrder >= 0) data.sort_order = sortOrder;
      if (!Object.keys(data).length) return bad("没有需要更新的内容");
      await adminWrite({ table, op: "update", data, match: { id } });
      return NextResponse.json({ ok: true });
    }

    // 删除：仅已停用条目可删；密码二次确认；两种模式。
    if (action === "delete") {
      const password = str(body.password, 128);
      const mode = body.mode === "with_content" ? "with_content" : "style_only";
      if (!password) return bad("请输入管理员密码以确认删除");

      // 密码校验（复用登录的 scrypt 校验；账号密码错误即拒绝）。
      const found = await authRpc("get_user", { username: ctx.username });
      if (!found.ok || !found.user?.password_hash) return bad("账号不存在", 404);
      if (!(await verifyPassword(password, found.user.password_hash))) {
        return bad("密码不正确，删除已取消", 401);
      }

      // 只允许删除已停用且未删除的条目。
      const current = await cloud.database
        .from(table)
        .select("id,is_active,deleted_at")
        .eq("id", id)
        .maybeSingle();
      const row = (current as { data?: { is_active: boolean; deleted_at: string | null } | null })
        .data;
      if (!row || row.deleted_at) return bad("条目不存在或已删除", 404);
      if (row.is_active) return bad("只有已停用的条目才可以删除");

      if (kind === "style") {
        // 连解读删：先删解读（外键约束要求），再删风格本身。
        if (mode === "with_content") {
          await adminWrite({ table: "interpretations", op: "delete", match: { style_id: id } });
        }
        await adminWrite({
          table: "styles",
          op: "update",
          data: { deleted_at: new Date().toISOString() },
          match: { id },
        });
      } else {
        if (mode === "with_content") {
          await adminWrite({ table: "interpretations", op: "delete", match: { audience_id: id } });
        }
        await adminWrite({
          table: "audiences",
          op: "update",
          data: { deleted_at: new Date().toISOString() },
          match: { id },
        });
      }
      return NextResponse.json({
        ok: true,
        mode,
        note: mode === "style_only" ? "风格已软删除，关联解读保留但不再展示" : "关联解读已一并删除",
      });
    }

    return bad("不支持的操作");
  } catch (e) {
    console.error("[dictionaries]", action, e);
    return bad((e as Error).message ?? "操作失败，请稍后重试", 503);
  }
}
