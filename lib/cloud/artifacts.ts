import type { SupabaseClient } from "@supabase/supabase-js";

export const ARTIFACT_BUCKET = "atoms-artifacts";
export const MAX_ARTIFACT_BYTES = 5 * 1024 * 1024;
export interface ArtifactBundle {
  files: { path: string; content: string; contentType: string }[];
  thumbnail?: string;
}
type ArtifactClient = Pick<SupabaseClient, "auth" | "storage">;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const mimeTypes = new Set(["text/html", "text/css", "text/javascript", "application/javascript", "application/json", "image/png", "image/jpeg", "image/webp", "image/gif", "image/svg+xml", "image/x-icon", "font/woff", "font/woff2", "application/octet-stream", "text/plain"]);

function decodedBase64(value: unknown): Buffer {
  if (typeof value !== "string" || value.length > MAX_ARTIFACT_BYTES || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) throw new Error("产物内容必须是有界 Base64");
  const bytes = Buffer.from(value, "base64");
  if (bytes.toString("base64") !== value) throw new Error("产物 Base64 编码无效");
  return bytes;
}

export function validateArtifactBundle(input: unknown): ArtifactBundle {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("产物结构无效");
  const raw = input as Record<string, unknown>;
  if (Object.keys(raw).some(key => !["files", "thumbnail"].includes(key)) || !Array.isArray(raw.files) || raw.files.length < 1 || raw.files.length > 256) throw new Error("产物文件数量或结构无效");
  const seen = new Set<string>();
  const files = raw.files.map(value => {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("产物文件结构无效");
    const file = value as Record<string, unknown>;
    if (Object.keys(file).some(key => !["path", "content", "contentType"].includes(key)) || typeof file.path !== "string" || file.path.length > 240 || !/^[A-Za-z0-9_@.-]+(?:\/[A-Za-z0-9_@.-]+)*$/.test(file.path) || file.path.split("/").some(part => part === "." || part === "..") || seen.has(file.path)) throw new Error("产物文件路径无效或重复");
    if (typeof file.contentType !== "string" || !mimeTypes.has(file.contentType)) throw new Error("产物资源类型不受支持");
    decodedBase64(file.content);
    seen.add(file.path);
    return { path: file.path, content: file.content as string, contentType: file.contentType };
  });
  const bundle: ArtifactBundle = { files };
  if (raw.thumbnail !== undefined) {
    const png = decodedBase64(raw.thumbnail);
    if (png.length > 1024 * 1024 || !png.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) throw new Error("缩略图必须是最多 1 MiB 的 PNG");
    bundle.thumbnail = raw.thumbnail as string;
  }
  if (Buffer.byteLength(JSON.stringify(bundle)) > MAX_ARTIFACT_BYTES) throw new Error("产物超过 5 MiB");
  return bundle;
}

export function artifactObjectPath(ownerId: string, projectId: string, artifactId: string): string {
  if (![ownerId, projectId, artifactId].every(value => uuid.test(value))) throw new Error("产物路径必须使用 UUID");
  return `${ownerId}/${projectId}/${artifactId}.json`;
}

async function owner(client: ArtifactClient): Promise<string> {
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) throw new Error("请先登录后访问产物");
  return data.user.id;
}

async function ownPath(client: ArtifactClient, projectId: string, path: string): Promise<void> {
  const parts = path.split("/");
  if (parts.length !== 3 || !parts[2].endsWith(".json") || path !== artifactObjectPath(await owner(client), projectId, parts[2].slice(0, -5))) throw new Error("产物路径不属于当前用户和项目");
}

export async function uploadArtifact(client: ArtifactClient, projectId: string, artifactId: string, input: unknown): Promise<string> {
  const bundle = validateArtifactBundle(input);
  const path = artifactObjectPath(await owner(client), projectId, artifactId);
  const { error } = await client.storage.from(ARTIFACT_BUCKET).upload(path, new Blob([JSON.stringify(bundle)], { type: "application/json" }), { contentType: "application/json", upsert: false });
  if (error) throw new Error(`产物上传失败：${error.message}`);
  return path;
}

export async function readArtifact(client: ArtifactClient, projectId: string, path: string): Promise<ArtifactBundle> {
  await ownPath(client, projectId, path);
  const { data, error } = await client.storage.from(ARTIFACT_BUCKET).download(path);
  if (error || !data) throw new Error(`产物读取失败：${error?.message || "无返回数据"}`);
  if (data.size > MAX_ARTIFACT_BYTES) throw new Error("产物超过 5 MiB");
  return validateArtifactBundle(JSON.parse(await data.text()));
}

export async function createSignedArtifactUrl(client: ArtifactClient, projectId: string, path: string, expiresIn = 60): Promise<string> {
  if (!Number.isInteger(expiresIn) || expiresIn < 1 || expiresIn > 300) throw new Error("产物签名有效期必须在 1–300 秒之间");
  await ownPath(client, projectId, path);
  const { data, error } = await client.storage.from(ARTIFACT_BUCKET).createSignedUrl(path, expiresIn);
  if (error || !data?.signedUrl) throw new Error(`产物签名失败：${error?.message || "无返回数据"}`);
  return data.signedUrl;
}

export async function deleteArtifact(client: ArtifactClient, projectId: string, path: string): Promise<void> {
  await ownPath(client, projectId, path);
  const { error } = await client.storage.from(ARTIFACT_BUCKET).remove([path]);
  if (error) throw new Error(`产物清理失败：${error.message}`);
}
