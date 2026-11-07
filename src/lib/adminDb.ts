// 后台写操作统一走服务端代理：浏览器不再直接持有数据库写权限。
// 服务端校验 httpOnly 会话 cookie 后，以私有密钥调用云端 admin_write 函数。
export type AdminTable =
  | "works"
  | "styles"
  | "audiences"
  | "interpretations"
  | "generation_jobs";
export type AdminOp = "insert" | "update" | "delete";

export interface AdminWriteArgs {
  table: AdminTable;
  op: AdminOp;
  data?: Record<string, unknown>;
  match?: Record<string, unknown>;
}

export interface AdminWriteResult {
  data?: Array<Record<string, unknown>>;
  error?: string;
}

export async function adminWrite(args: AdminWriteArgs): Promise<AdminWriteResult> {
  try {
    const res = await fetch("/api/admin/db", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        table: args.table,
        op: args.op,
        data: args.data ?? {},
        match: args.match ?? {},
      }),
    });
    const json = (await res.json()) as { data?: Array<Record<string, unknown>>; error?: string };
    if (!res.ok) {
      return { error: json.error ?? `保存失败（HTTP ${res.status}）` };
    }
    return { data: Array.isArray(json.data) ? json.data : [] };
  } catch (e) {
    return { error: (e as Error).message ?? "网络错误" };
  }
}
