import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";

const ownerId = "123e4567-e89b-42d3-a456-426614174001";
const projectId = "123e4567-e89b-42d3-a456-426614174002";
// A complete, valid PNG generated from a 960 × 600 white canvas.
const { default: sharp } = await import("sharp");
const png = await sharp({ create: { width: 960, height: 600, channels: 3, background: "white" } }).png().toBuffer();
const module = await import("../../lib/cloud/project-thumbnail.ts");

function fixture() {
  let user: { id: string } | null = { id: ownerId };
  const objects = new Map<string, Blob>();
  const uploads: { path: string; options: unknown }[] = [];
  let downloadError: object | undefined, uploadError: object | undefined;
  const client = {
    auth: { getUser: async () => ({ data: { user }, error: null }) },
    storage: { from: (bucket: string) => {
      assert.equal(bucket, "atoms-artifacts");
      return {
        download: async (path: string) => ({ data: objects.get(path) || null, error: downloadError || (objects.has(path) ? null : { code: "NoSuchKey", statusCode: "404", message: "Object not found" }) }),
        upload: async (path: string, data: Blob, options: unknown) => {
          uploads.push({ path, options });
          if (uploadError) return { error: uploadError };
          objects.set(path, data); return { error: null };
        },
      };
    } },
  } as unknown as Pick<SupabaseClient, "auth" | "storage">;
  return { client, objects, uploads, user: (value: typeof user) => { user = value; }, downloadError: (value: object) => { downloadError = value; }, uploadError: (value: object) => { uploadError = value; } };
}

test("私有版本封面只创建一次，使用独立UUIDv5 JSON且不覆盖", async () => {
  assert.ok(module, "缺少版本封面缓存实现");
  const f = fixture(); let captures = 0;
  const create = async () => { captures++; return png; };
  assert.deepEqual(await module.getOrCreateProjectThumbnail(f.client, projectId, 1, create), png);
  assert.deepEqual(await module.getOrCreateProjectThumbnail(f.client, projectId, 1, create), png);
  assert.equal(captures, 1);
  assert.equal(f.uploads.length, 1);
  assert.equal(f.uploads[0].path, `${ownerId}/${projectId}/35241e20-6e9f-5f04-9e97-f9e186b658bf.json`);
  assert.match(f.uploads[0].path, new RegExp(`^${ownerId}/${projectId}/[a-f0-9]{8}-[a-f0-9]{4}-5[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}\\.json$`));
  assert.deepEqual(f.uploads[0].options, { contentType: "application/json", upsert: false });
  const blob = f.objects.get(f.uploads[0].path)!;
  assert.equal(blob.type, "application/json");
  assert.deepEqual(JSON.parse(await blob.text()), { version: 1, thumbnail: png.toString("base64") });
  await module.getOrCreateProjectThumbnail(f.client, projectId, 2, create);
  assert.notEqual(f.uploads[0].path, f.uploads[1].path);
});

test("登录和租户路径先行，不把其他Storage错误当缓存miss", async () => {
  assert.ok(module);
  const f = fixture(); let captures = 0;
  const create = async () => { captures++; return png; };
  f.user(null);
  await assert.rejects(module.getOrCreateProjectThumbnail(f.client, projectId, 1, create), /登录/);
  assert.equal(captures, 0);
  f.user({ id: ownerId });
  for (const error of [{ code: "AccessDenied", statusCode: "403", message: "denied" }, { statusCode: "404", message: "bucket missing" }, { code: "InternalError", statusCode: "500", message: "offline" }]) {
    f.downloadError(error);
    await assert.rejects(module.getOrCreateProjectThumbnail(f.client, projectId, 1, create), /封面读取失败/);
  }
  assert.equal(captures, 0); assert.equal(f.uploads.length, 0);
  const tenant = fixture(); tenant.user({ id: "123e4567-e89b-42d3-a456-426614174009" });
  await module.getOrCreateProjectThumbnail(tenant.client, projectId, 1, create);
  assert.match(tenant.uploads[0].path, /^123e4567-e89b-42d3-a456-426614174009\//);
});

test("并发上传冲突读取赢家，不覆盖，也不吞上传服务错误", async () => {
  assert.ok(module);
  const f = fixture();
  await module.getOrCreateProjectThumbnail(f.client, projectId, 1, async () => png);
  const path = f.uploads[0].path; f.objects.delete(path);
  f.uploadError({ code: "ResourceAlreadyExists", statusCode: "409", message: "exists" });
  const winner = await sharp({ create: { width: 960, height: 600, channels: 3, background: "blue" } }).png().toBuffer();
  const result = await module.getOrCreateProjectThumbnail(f.client, projectId, 1, async () => {
    f.objects.set(path, new Blob([JSON.stringify({ version: 1, thumbnail: winner.toString("base64") })]));
    return png;
  });
  assert.deepEqual(result, winner);
  f.objects.delete(path); f.uploadError({ code: "InternalError", message: "offline" });
  await assert.rejects(module.getOrCreateProjectThumbnail(f.client, projectId, 1, async () => png), /封面上传失败/);
});

test("PNG尺寸、上限和缓存版本损坏必须拒绝，不重新截图掩盖", async () => {
  assert.ok(module);
  const f = fixture(); let captures = 0;
  for (const bad of [Buffer.from("not png"), Buffer.alloc(1024 * 1024 + 1), await sharp({ create: { width: 1, height: 1, channels: 3, background: "white" } }).png().toBuffer()]) {
    await assert.rejects(module.getOrCreateProjectThumbnail(f.client, projectId, 1, async () => bad), /PNG/);
  }
  assert.equal(f.uploads.length, 0);
  await module.getOrCreateProjectThumbnail(f.client, projectId, 1, async () => png);
  f.objects.set(f.uploads[0].path, new Blob([JSON.stringify({ version: 2, thumbnail: png.toString("base64") })]));
  await assert.rejects(module.getOrCreateProjectThumbnail(f.client, projectId, 1, async () => { captures++; return png; }), /封面缓存/);
  assert.equal(captures, 0);
});
