import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ARTIFACT_BUCKET, artifactObjectPath } from "./artifacts.ts";

type ThumbnailClient = Pick<SupabaseClient, "auth" | "storage">;
const maximumPngBytes = 1024 * 1024;
const maximumJsonBytes = Math.ceil(maximumPngBytes / 3) * 4 + 128;

export function validateProjectThumbnail(png: Buffer): Buffer {
  if (png.length > maximumPngBytes || png.length < 33 || !png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) || png.readUInt32BE(8) !== 13 || png.toString("ascii", 12, 16) !== "IHDR" || png.readUInt32BE(16) !== 960 || png.readUInt32BE(20) !== 600) throw new Error("封面必须是最多 1 MiB 的 960×600 PNG");
  return png;
}

// RFC 9562 UUIDv5: project UUID is the namespace; a distinct name avoids run artifacts.
export function projectThumbnailId(projectId: string, version: number): string {
  artifactObjectPath(projectId, projectId, projectId);
  if (!Number.isSafeInteger(version) || version < 1) throw new Error("封面版本无效");
  const bytes = createHash("sha1").update(Buffer.from(projectId.replaceAll("-", ""), "hex")).update(`atoms-thumbnail:${version}`).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function missing(error: { code?: string; statusCode?: string; message: string }): boolean {
  return error.code === "NoSuchKey" || error.code === "not_found" || (!error.code && error.statusCode === "404" && /^(Object not found|Not Found)$/.test(error.message));
}

export async function getOrCreateProjectThumbnail(client: ThumbnailClient, projectId: string, version: number, create: () => Promise<Buffer>): Promise<Buffer> {
  const { data: auth, error: authError } = await client.auth.getUser();
  if (authError || !auth.user) throw new Error("请先登录后访问封面");
  const path = artifactObjectPath(auth.user.id, projectId, projectThumbnailId(projectId, version));
  const bucket = client.storage.from(ARTIFACT_BUCKET);
  async function read(): Promise<Buffer | undefined> {
    const { data, error } = await bucket.download(path);
    if (error) {
      if (missing(error)) return undefined;
      throw new Error(`封面读取失败：${error.message}`);
    }
    if (!data) throw new Error("封面读取失败：无返回数据");
    if (data.size > maximumJsonBytes) throw new Error("封面缓存超过上限");
    const raw: unknown = JSON.parse(await data.text());
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("封面缓存结构无效");
    const cache = raw as Record<string, unknown>;
    if (Object.keys(cache).some(key => !["version", "thumbnail"].includes(key)) || cache.version !== version || typeof cache.thumbnail !== "string" || cache.thumbnail.length > maximumJsonBytes || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(cache.thumbnail)) throw new Error("封面缓存版本或内容无效");
    const png = Buffer.from(cache.thumbnail, "base64");
    if (png.toString("base64") !== cache.thumbnail) throw new Error("封面缓存编码无效");
    return validateProjectThumbnail(png);
  }
  const cached = await read();
  if (cached) return cached;
  const png = validateProjectThumbnail(await create());
  const { error } = await bucket.upload(path, new Blob([JSON.stringify({ version, thumbnail: png.toString("base64") })], { type: "application/json" }), { contentType: "application/json", upsert: false });
  if (!error) return png;
  const code = (error as { code?: string }).code;
  if (code === "ResourceAlreadyExists" || (!code && error.statusCode === "409")) {
    const winner = await read();
    if (winner) return winner;
    throw new Error("封面上传冲突后缓存不存在");
  }
  throw new Error(`封面上传失败：${error.message}`);
}
