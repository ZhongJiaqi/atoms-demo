import assert from "node:assert/strict";
import { mkdir, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { registerHooks } from "node:module";
import test, { mock } from "node:test";
import sharp from "sharp";

registerHooks({ resolve(specifier, context, next) {
  if (specifier === "next/server") return next("next/server.js", context);
  if (specifier.startsWith("@/")) return next(new URL(`../../${specifier.slice(2)}.ts`, import.meta.url).href, context);
  return next(specifier, context);
} });

const projectId = "123e4567-e89b-42d3-a456-426614174002";
const ownerId = "123e4567-e89b-42d3-a456-426614174001";
const runId = "123e4567-e89b-42d3-a456-426614174003";
const cloudArtifactPath = `${ownerId}/${projectId}/${runId}.json`;
const png = await sharp({ create: { width: 960, height: 600, channels: 3, background: "red" } }).png().toBuffer();
const files = [{ path: "index.html", content: Buffer.from("<main>Cloud</main>").toString("base64"), contentType: "text/html" }];
const snapshot = { version: 1, name: "Old project", summary: "saved snapshot", files: [{ path: "src/App.tsx", content: "export default()=> <main>Legacy</main>" }] };
let loggedIn = true, authorized = true, thumbnail: string | undefined;
let artifactPath: string | undefined = cloudArtifactPath;
let downloadError: object | undefined, captureFails = false, buildFails = false;
let onBundleRead: (() => void) | undefined, onCapture: (() => Promise<void>) | undefined;
let captureTimeout: number | undefined;
let currentVersion = 1;
let downloads = 0, captures = 0, builds = 0, databaseWrites = 0;
let hydratedRoot = "", hydration: { state: unknown; project: unknown } | undefined;
const caches = new Map<string, Blob>();
const uploads: { path: string; options: unknown }[] = [];
const lifecycle: (() => Promise<unknown>)[] = [];
const client = {
  auth: { getUser: async () => ({ data: { user: loggedIn ? { id: ownerId } : null }, error: null }) },
  from: (table: string) => {
    const rows: Record<string, unknown> = {
      projects: authorized ? { id: projectId, name: "Latest project", summary: "latest", current_version: currentVersion } : null,
      messages: [], project_files: [], project_versions: snapshot,
      agent_runs: [1, 2].map(version => ({ id: version === 1 ? runId : "123e4567-e89b-42d3-a456-426614174004", version, status: "completed", events: [{ event: "complete", data: artifactPath === undefined ? {} : { artifactPath } }] })),
    };
    const query = { select: () => query, eq: () => query,
      single: async () => ({ data: rows[table], error: authorized ? null : { message: "RLS拒绝" } }),
      order: async () => { if (table === "agent_runs") onBundleRead?.(); return { data: rows[table], error: null }; },
      insert: () => { databaseWrites++; throw new Error("封面不得写数据库"); },
      update: () => { databaseWrites++; throw new Error("封面不得修改版本"); },
    };
    return query;
  },
  storage: { from: () => ({
    download: async (path: string) => {
      downloads++;
      if (downloadError) return { error: downloadError, data: null };
      if (path !== cloudArtifactPath) return { data: caches.get(path) || null, error: caches.has(path) ? null : { code: "NoSuchKey", statusCode: "404", message: "Object not found" } };
      return { error: null, data: new Blob([JSON.stringify({ files, ...(thumbnail ? { thumbnail } : {}) })]) };
    },
    upload: async (path: string, data: Blob, options: unknown) => { uploads.push({ path, options }); caches.set(path, data); return { error: null }; },
  }) },
};
mock.module("@/lib/supabase/server", { namedExports: { createClient: async () => client } });
mock.module("next/server.js", { namedExports: { after: (callback: () => Promise<unknown>) => { lifecycle.push(callback); } } });
mock.module("@/lib/agent/files", { namedExports: {
  GENERATED_ROOT: "/tmp/atoms-thumbnail-contract",
  hydrateProjectDirectoryAt: async (root: string, state: unknown, project: unknown) => { hydratedRoot = root; hydration = { state, project }; return root; },
} });
mock.module("@/lib/sandbox/vercel-build", { namedExports: { buildInVercelSandbox: async (directory: string) => {
  builds++; if (buildFails) return { success: false };
  await mkdir(join(directory, "dist")); await writeFile(join(directory, "dist", "index.html"), "<main>Legacy</main>"); return { success: true };
} } });
mock.module("@/lib/cloud/capture-thumbnail", { namedExports: { captureCloudThumbnail: async (artifact: { files: typeof files }, options?: { timeoutMs: number }) => {
  captures++; assert.ok(artifact.files.some(file => file.path === "index.html"));
  captureTimeout = options?.timeoutMs; await onCapture?.();
  if (captureFails) throw new Error("真实截图依赖故障"); return png;
} } });
mock.module("@/lib/sandbox/local-sandbox", { namedExports: { buildProject: async () => { throw new Error("云封面不能启动本地构建"); }, discardStagedPreview: () => {}, startPreview: async () => { throw new Error("云封面不能启动本地预览"); } } });
mock.module("playwright", { namedExports: { chromium: { launch: async () => { throw new Error("云封面不能启动本地Chromium"); } } } });
const { GET } = await import("../../app/api/projects/[projectId]/thumbnail/route.ts");
const request = (version = 1) => GET(new Request(`https://app.example/api/projects/${projectId}/thumbnail?version=${version}`), { params: Promise.resolve({ projectId }) });

async function cloud(body: () => Promise<void>) {
  const before = process.env.VERCEL; process.env.VERCEL = "1";
  loggedIn = true; authorized = true; thumbnail = undefined; artifactPath = cloudArtifactPath;
  downloadError = undefined; captureFails = false; buildFails = false;
  onBundleRead = undefined; onCapture = undefined; captureTimeout = undefined;
  currentVersion = 1;
  downloads = 0; captures = 0; builds = 0; databaseWrites = 0; hydratedRoot = ""; hydration = undefined;
  caches.clear(); uploads.length = 0; lifecycle.length = 0;
  try { await body(); }
  finally { if (before === undefined) delete process.env.VERCEL; else process.env.VERCEL = before; }
}

test("云bundle缺封面时截图PNG并私有缓存，重复请求不截图或构建", () => cloud(async () => {
  const responses = await Promise.all([request(), request()]);
  for (const response of responses) {
    assert.equal(response.status, 200); assert.equal(response.headers.get("content-type"), "image/png");
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), png);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    assert.equal(response.headers.get("x-project-version"), "1");
  }
  assert.equal(captures, 1); assert.equal(builds, 0); assert.equal(databaseWrites, 0);
  assert.equal(uploads.length, 1); assert.notEqual(uploads[0].path, cloudArtifactPath);
  assert.deepEqual(uploads[0].options, { contentType: "application/json", upsert: false });
  assert.equal((await request()).status, 200); assert.equal(captures, 1);
}));

test("旧local成功版本无artifactPath从历史快照重建，仅封面缓存且清本次临时目录", () => cloud(async () => {
  artifactPath = undefined;
  const response = await request();
  assert.equal(response.status, 200); assert.equal(response.headers.get("content-type"), "image/png");
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), png);
  assert.equal(builds, 1); assert.equal(captures, 1); assert.equal(databaseWrites, 0);
  assert.deepEqual(hydration?.project, { projectName: "Old project", summary: "saved snapshot", files: snapshot.files });
  assert.equal((hydration?.state as { currentVersion: number }).currentVersion, 1);
  assert.ok(hydratedRoot.includes("atoms-cloud-thumbnail-"));
  await assert.rejects(stat(hydratedRoot), { code: "ENOENT" });
  assert.equal(uploads.length, 1); assert.notEqual(uploads[0].path, cloudArtifactPath);
  assert.equal((await request()).status, 200); assert.equal(builds, 1); assert.equal(captures, 1);
}));

test("legacy构建或截图失败仍清临时目录且不写缓存或版本", () => cloud(async () => {
  artifactPath = undefined; buildFails = true;
  assert.equal((await request()).status, 500); await assert.rejects(stat(hydratedRoot), { code: "ENOENT" });
  assert.equal(captures, 0); assert.equal(uploads.length, 0);
  buildFails = false; captureFails = true;
  assert.equal((await request()).status, 500); await assert.rejects(stat(hydratedRoot), { code: "ENOENT" });
  assert.equal(uploads.length, 0); assert.equal(databaseWrites, 0);
}));

test("auth、租户和版本验证先于封面读取及截图", () => cloud(async () => {
  loggedIn = false; assert.equal((await request()).status, 401);
  loggedIn = true; authorized = false; assert.equal((await request()).status, 404);
  authorized = true; assert.equal((await request(2)).status, 400);
  assert.equal(downloads, 0); assert.equal(captures, 0); assert.equal(builds, 0);
}));

test("已记录路径不匹配及Storage服务错误不能fallback重建或掩盖", () => cloud(async () => {
  artifactPath = `${ownerId}/${projectId}/123e4567-e89b-42d3-a456-426614174004.json`;
  assert.equal((await request()).status, 500); assert.equal(downloads, 0);
  artifactPath = cloudArtifactPath; downloadError = { code: "InternalError", statusCode: "500", message: "Storage service unavailable" };
  assert.equal((await request()).status, 500);
  downloadError = { code: "NoSuchKey", statusCode: "404", message: "Object not found" };
  assert.equal((await request()).status, 500);
  assert.equal(captures, 0); assert.equal(builds, 0); assert.equal(uploads.length, 0);
}));

test("已有embedded云PNG优先且保持原字节、不截图或构建", () => cloud(async () => {
  thumbnail = png.toString("base64");
  const response = await request();
  assert.equal(response.status, 200); assert.equal(response.headers.get("content-type"), "image/png");
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), png);
  assert.equal(captures, 0); assert.equal(builds, 0); assert.equal(uploads.length, 0);
}));

test("legacy整体剩余不足190秒时拒绝启动180秒云构建", () => cloud(async () => {
  let clock = 1000;
  const time = mock.method(Date, "now", () => clock);
  try {
    artifactPath = undefined; onBundleRead = () => { clock += 120000; };
    assert.equal((await request()).status, 503);
    assert.equal(builds, 0); assert.equal(captures, 0); assert.equal(uploads.length, 0);
  } finally { time.mock.restore(); }
}));

test("截图只收到整体剩余预算减20秒，过期后不上传缓存", () => cloud(async () => {
  let clock = 1000;
  const time = mock.method(Date, "now", () => clock);
  try {
    onBundleRead = () => { clock += 200000; };
    onCapture = async () => { clock += 60001; };
    assert.equal((await request()).status, 503);
    assert.equal(captureTimeout, 40000);
    assert.equal(uploads.length, 0); assert.equal(builds, 0);
  } finally { time.mock.restore(); }
}));

test("整体260秒到期即响应，排队版本过期后不读缓存或再启动VM", () => cloud(async () => {
  mock.timers.enable({ apis: ["Date", "setTimeout"], now: 1000 });
  let release!: () => void;
  try {
    artifactPath = undefined; currentVersion = 2;
    onCapture = () => new Promise<void>(resolve => { release = resolve; });
    const first = request(1);
    for (let attempt = 0; captures === 0 && attempt < 100; attempt++) await new Promise(resolve => setImmediate(resolve));
    assert.equal(captures, 1);
    const queued = request(2);
    await new Promise(resolve => setImmediate(resolve));
    mock.timers.tick(260001);
    const expired = await queued;
    assert.equal(expired.status, 503); assert.equal(expired.headers.get("cache-control"), "no-store");
    assert.equal((await first).status, 503);
    assert.equal(lifecycle.length, 2, "超时请求必须登记原工作Promise的收尾");
    let settled = false;
    const cleanup = Promise.all(lifecycle.map(callback => callback())).then(() => { settled = true; });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(settled, false, "HTTP503后平台仍等待已启动VM的清理");
    release();
    await cleanup;
    for (let attempt = 0; attempt < 100; attempt++) {
      await new Promise(resolve => setImmediate(resolve));
      if (!(await stat(hydratedRoot).catch(() => null))) break;
    }
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(builds, 1); assert.equal(captures, 1); assert.equal(uploads.length, 0);
    assert.equal(downloads, 1);
    await assert.rejects(stat(hydratedRoot), { code: "ENOENT" });
  } finally { release?.(); mock.timers.reset(); }
}));
