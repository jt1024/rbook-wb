import "server-only";

/**
 * 云服务连接配置 —— 仅服务端可见。
 *
 * 历史版本这里硬编码了 endpoint / publishableKey，浏览器 bundle 会带上它们，
 * 任何人都能直接调用 LLM 网关。现在全部改由环境变量注入，前端只访问本站
 * `/api/data`（只读数据库代理）与 `/api/ai/*`（AI 代理），不再持有任何云凭证。
 */
export const publicConfig = {
  endpoint: process.env.CLOUD_ENDPOINT ?? "",
  oauthRelayBaseUrl:
    process.env.CLOUD_OAUTH_RELAY_BASE_URL ??
    "https://www.workbuddy.cn/v2/as/genie-baas/oauth",
  publishableKey: process.env.CLOUD_PUBLISHABLE_KEY ?? "",
} as const;

/** 服务端调用前做一次显式校验，避免把空配置传给 SDK 后报晦涩错误。 */
export function assertCloudConfig(): void {
  if (!publicConfig.endpoint || !publicConfig.publishableKey) {
    throw new Error(
      "服务端未配置 CLOUD_ENDPOINT / CLOUD_PUBLISHABLE_KEY，请检查 .env.local"
    );
  }
}
