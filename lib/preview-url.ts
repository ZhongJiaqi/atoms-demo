const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

function configuredPreviewOrigin(projectId: string) {
  const template = process.env.PREVIEW_PUBLIC_ORIGIN?.trim();
  if (!template) return null;
  const value = template.replaceAll("{projectId}", projectId).replace(/\/$/, "");
  const url = new URL(value);
  if (!/^https?:$/.test(url.protocol)) throw new Error("PREVIEW_PUBLIC_ORIGIN 必须使用 HTTP(S)。");
  return url.origin;
}

export function previewOrigin(appOrigin: string, projectId: string) {
  const configured = configuredPreviewOrigin(projectId);
  if (configured) return configured;

  const app = new URL(appOrigin);
  if (LOCAL_HOSTS.has(app.hostname)) {
    app.hostname = `${projectId}.localhost`;
    return app.origin;
  }
  return app.origin;
}

export function previewUrl(appOrigin: string, projectId: string, version: number) {
  const url = new URL(`/api/preview/${projectId}/`, previewOrigin(appOrigin, projectId));
  url.searchParams.set("version", String(version));
  return url.toString();
}

export function previewFrameAncestors() {
  const values = new Set(["http://localhost:*", "http://127.0.0.1:*"]);
  const configured = process.env.APP_PUBLIC_ORIGIN?.trim();
  if (configured) values.add(new URL(configured).origin);
  return [...values].join(" ");
}
