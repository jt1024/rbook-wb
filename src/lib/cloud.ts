import "server-only";

import { createWorkBuddyCloud } from "@tencent-ai/workbuddy-cloud-sdk";
import { assertCloudConfig, publicConfig } from "./publicConfig";

// SDK 的 database 模块需要注入 Database schema 类型；未注入时表行类型会退化为
// never，使 update/insert/select 的参数与返回值全部失去类型。这里只放宽 database
// 的静态类型，运行时对象不变，llm / auth / storage 仍保持 SDK 原始类型。
type CloudClient = Omit<ReturnType<typeof createWorkBuddyCloud>, "database"> & {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  database: any;
};

let instance: CloudClient | null = null;

function client(): CloudClient {
  if (!instance) {
    // 延迟初始化：构建期不要求云凭证存在，只在第一次真正访问云端时校验。
    assertCloudConfig();
    instance = createWorkBuddyCloud({
      endpoint: publicConfig.endpoint,
      oauthRelayBaseUrl: publicConfig.oauthRelayBaseUrl,
      publishableKey: publicConfig.publishableKey,
    }) as unknown as CloudClient;
  }
  return instance;
}

/**
 * 全站唯一（服务端）云服务客户端。用 Proxy 做延迟初始化，
 * 保证浏览器 bundle 里既没有凭证、也不会在模块加载时触发网络/配置错误。
 */
export const cloud: CloudClient = new Proxy({} as CloudClient, {
  get(_target, prop) {
    const value = (client() as unknown as Record<string | symbol, unknown>)[prop];
    return typeof value === "function" ? value.bind(client()) : value;
  },
});

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
