import { createWorkBuddyCloud } from "@tencent-ai/workbuddy-cloud-sdk";
import { publicConfig } from "./publicConfig";

// SDK 的 database 模块需要注入 Database schema 类型；未注入时表行类型会退化为
// never，使 update/insert/select 的参数与返回值全部失去类型。这里只放宽 database
// 的静态类型，运行时对象不变，llm / auth / storage 仍保持 SDK 原始类型。
type CloudClient = Omit<ReturnType<typeof createWorkBuddyCloud>, "database"> & {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  database: any;
};

// 全站唯一的云服务客户端：数据库 / LLM 均复用此实例
export const cloud = createWorkBuddyCloud({
  endpoint: publicConfig.endpoint,
  oauthRelayBaseUrl: publicConfig.oauthRelayBaseUrl,
  publishableKey: publicConfig.publishableKey,
}) as unknown as CloudClient;

// 将 { data, error } 信封转为 throw-on-error，调用点更干净
export function unwrap<T>(result: { data: T | null; error: unknown }): T {
  if (result.error) {
    throw result.error;
  }
  if (result.data === null) {
    throw new Error("查询结果为空");
  }
  return result.data;
}

// 优雅降级的查询：出错时返回 null 而不中断渲染
export async function safeQuery<T>(
  fn: () => Promise<{ data: T | null; error: unknown }>
): Promise<T | null> {
  try {
    const { data, error } = await fn();
    if (error) {
      console.error("[db]", error);
      return null;
    }
    return data;
  } catch (e) {
    console.error("[db]", e);
    return null;
  }
}
