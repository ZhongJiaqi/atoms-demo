import { getPreview } from "@/lib/sandbox/local-sandbox";
import { previewFrameAncestors } from "@/lib/preview-url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ projectId: string; path?: string[] }>;
};

async function proxyPreview(request: Request, context: RouteContext) {
  const { projectId, path = [] } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(projectId) || path.some((part) => part === ".." || part === ".")) {
    return new Response("无效预览路径。", { status: 400 });
  }
  const preview = getPreview(projectId);
  if (!preview) return new Response("预览不存在或已在 15 分钟后自动关闭。", { status: 410 });

  const incoming = new URL(request.url);
  const target = new URL(`http://127.0.0.1:${preview.port}/${path.map(encodeURIComponent).join("/")}`);
  target.search = incoming.search;

  try {
    const upstream = await fetch(target, {
      method: request.method,
      redirect: "manual",
      signal: AbortSignal.timeout(4_000),
    });
    const headers = new Headers(upstream.headers);
    headers.set("Access-Control-Allow-Origin", "*");
    headers.set("Cross-Origin-Resource-Policy", "cross-origin");
    headers.set("X-Content-Type-Options", "nosniff");
    headers.set("Cache-Control", path.length ? "public, max-age=31536000, immutable" : "no-store");
    if (request.method !== "HEAD") {
      headers.delete("content-length");
      headers.delete("content-encoding");
    }
    const isHtml = (headers.get("content-type") ?? "").includes("text/html");
    let body: BodyInit | null = request.method === "HEAD" ? null : upstream.body;
    if (isHtml) {
      headers.set(
        "Content-Security-Policy",
        `default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'none'; media-src 'self' data: blob:; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors ${previewFrameAncestors()}`,
      );
      if (request.method !== "HEAD") {
        const previewBase = `/api/preview/${projectId}/assets/`;
        const html = await upstream.text();
        body = html
          .replaceAll('src="./assets/', `src="${previewBase}`)
          .replaceAll('href="./assets/', `href="${previewBase}`);
      }
    }
    return new Response(body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers,
    });
  } catch {
    return new Response("预览沙盒当前不可用。", { status: 502 });
  }
}

export const GET = proxyPreview;
export const HEAD = proxyPreview;

