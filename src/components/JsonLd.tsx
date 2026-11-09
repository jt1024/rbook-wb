import type { JsonLdObject } from "@/lib/seo";

/**
 * 服务端注入 JSON-LD。数据库内容可能含 `</script>` 等字符，
 * 这里统一转义，避免结构化数据变成 XSS 入口。
 */
export function JsonLd({
  data,
}: {
  data: JsonLdObject | JsonLdObject[];
}) {
  const json = JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: json }}
    />
  );
}
