import { validateArtifactBundle, type ArtifactBundle } from "./artifacts.ts";

// Each project has a separate origin; embedding assets avoids cross-site cookies
// and expiring asset requests. The gateway still supplies restrictive CSP headers.
export function renderArtifactPreview(input: ArtifactBundle): string {
  const bundle = validateArtifactBundle(input);
  const files = new Map(bundle.files.map(file => [file.path, file]));
  const index = files.get("index.html");
  if (!index || index.contentType !== "text/html") throw new Error("预览缺少 index.html");
  const active = new Set<string>();
  let embeddedBytes = 0;
  const maxBytes = 8 * 1024 * 1024;
  function resource(reference: string, from: string): string {
    if (reference.startsWith("data:") || reference.startsWith("#")) return reference;
    const url = new URL(reference, `https://preview-resource.invalid/${from}`);
    if (url.origin !== "https://preview-resource.invalid") throw new Error("预览不支持外部资源依赖");
    const path = decodeURIComponent(url.pathname.slice(1));
    const file = files.get(path);
    if (!file) throw new Error("预览引用了缺失的构建资源");
    if (active.has(path)) throw new Error("预览资源存在循环引用");
    active.add(path);
    try {
      let content = file.content;
      if (file.contentType === "text/css") {
        const css = Buffer.from(content, "base64").toString("utf8");
        if (/@import\b/i.test(css)) throw new Error("预览样式必须由构建器合并");
        content = Buffer.from(css.replace(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^\s)]*))\s*\)/gi,
          (_match, double, single, bare) => `url("${resource(double ?? single ?? bare, path)}")`)).toString("base64");
      }
      const result = `data:${file.contentType};base64,${content}${url.hash}`;
      embeddedBytes += result.length;
      if (embeddedBytes > maxBytes) throw new Error("预览内嵌资源超过 8 MiB");
      return result;
    } finally { active.delete(path); }
  }
  const html = Buffer.from(index.content, "base64").toString("utf8").replace(/<(?:script|link|img|source|video)\b[^>]*>/gi, tag => {
    if (/\bsrcset\s*=/i.test(tag)) throw new Error("预览暂不支持 srcset 构建资源");
    return tag.replace(/\b(src|href|poster)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi,
      (_match, attr, double, single, bare) => `${attr}="${resource(double ?? single ?? bare, "index.html")}"`);
  });
  if (Buffer.byteLength(html) > maxBytes) throw new Error("预览 HTML 超过 8 MiB");
  return html;
}
