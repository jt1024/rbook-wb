// WorkBuddy Cloud Service publicConfig
// 由云服务开通时返回，可随前端源码分发（不含任何私密凭证）
export const publicConfig = {
  resourceId: "wbcs_REDACTED",
  endpoint: "https://example.workbuddy.host",
  oauthRelayBaseUrl: "https://www.workbuddy.cn/v2/as/genie-baas/oauth",
  publishableKey:
    "wbpk_REDACTED",
} as const;
