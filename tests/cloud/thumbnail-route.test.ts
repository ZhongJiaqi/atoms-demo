import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test, { mock } from "node:test";

registerHooks({ resolve(specifier, context, next) {
  if (specifier.startsWith("@/")) return next(new URL(`../../${specifier.slice(2)}.ts`, import.meta.url).href, context);
  return next(specifier, context);
} });

const projectId = "123e4567-e89b-42d3-a456-426614174002";
const ownerId = "123e4567-e89b-42d3-a456-426614174001";
const runId = "123e4567-e89b-42d3-a456-426614174003";
const cloudArtifactPath = `${ownerId}/${projectId}/${runId}.json`;
let loggedIn = true, authorized = true, thumbnail: string | undefined;
let artifactPath: string | undefined = cloudArtifactPath, downloadError: string | undefined, downloads = 0;
const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const client = {
  auth: { getUser: async () => ({ data: { user: loggedIn ? { id: ownerId } : null }, error: null }) },
  from: (table: string) => {
    const rows: Record<string, unknown> = {
      projects: authorized ? { id: projectId, current_version: 1 } : null,
      messages: [], project_files: [],
      agent_runs: [{ id: runId, version: 1, status: "completed", events: [{ event: "complete", data: artifactPath === undefined ? {} : { artifactPath } }] }],
    };
    const query = { select: () => query, eq: () => query,
      single: async () => ({ data: rows[table], error: authorized ? null : { message: "RLS拒绝" } }),
      order: async () => ({ data: rows[table], error: null }),
    };
    return query;
  },
  storage: { from: () => ({ download: async () => { downloads++; return { error: downloadError ? { message: downloadError } : null, data: new Blob([JSON.stringify({
    files: [{ path: "index.html", content: Buffer.from("<main>Cloud</main>").toString("base64"), contentType: "text/html" }],
    ...(thumbnail ? { thumbnail } : {}),
  })]) }; } }) },
};
mock.module("@/lib/supabase/server", { namedExports: { createClient: async () => client } });
mock.module("@/lib/agent/files", { namedExports: { GENERATED_ROOT: "/tmp/atoms-thumbnail-contract", hydrateProjectDirectoryAt: async () => { throw new Error("云封面不能启动本地构建"); } } });
mock.module("@/lib/sandbox/local-sandbox", { namedExports: { buildProject: async () => { throw new Error("云封面不能启动本地构建"); }, discardStagedPreview: () => {}, startPreview: async () => { throw new Error("云封面不能启动本地预览"); } } });
mock.module("playwright", { namedExports: { chromium: { launch: async () => { throw new Error("云封面不能启动Chromium"); } } } });
const { GET } = await import("../../app/api/projects/[projectId]/thumbnail/route.ts");

test("旧本地成功版本没有云产物记录时返回占位且不下载或构建", async () => {
  const before = process.env.VERCEL; process.env.VERCEL = "1";
  artifactPath = undefined; downloadError = "Object not found"; downloads = 0;
  const request = (version = 1) => GET(new Request(`https://app.example/api/projects/${projectId}/thumbnail?version=${version}`), { params: Promise.resolve({ projectId }) });
  try {
    const response = await request();
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type")!, /^image\/svg\+xml/);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    assert.equal(response.headers.get("x-project-version"), "1");
    assert.equal(response.headers.get("x-atoms-thumbnail-state"), "unavailable");
    assert.match(await response.text(), /封面暂未生成/);
    loggedIn = false; assert.equal((await request()).status, 401);
    loggedIn = true; authorized = false; assert.equal((await request()).status, 404);
    authorized = true; assert.equal((await request(2)).status, 400);
    assert.equal(downloads, 0);
  } finally {
    loggedIn = true; authorized = true; artifactPath = cloudArtifactPath; downloadError = undefined;
    if (before === undefined) delete process.env.VERCEL; else process.env.VERCEL = before;
  }
});

test("已记录云产物路径不匹配或下载失败不能降级伪称可用封面", async () => {
  const before = process.env.VERCEL; process.env.VERCEL = "1";
  const request = () => GET(new Request(`https://app.example/api/projects/${projectId}/thumbnail?version=1`), { params: Promise.resolve({ projectId }) });
  try {
    artifactPath = `${ownerId}/${projectId}/123e4567-e89b-42d3-a456-426614174004.json`; downloads = 0;
    assert.equal((await request()).status, 500);
    assert.equal(downloads, 0);
    artifactPath = cloudArtifactPath; downloadError = "Storage service unavailable";
    assert.equal((await request()).status, 500);
    assert.equal(downloads, 1);
  } finally {
    artifactPath = cloudArtifactPath; downloadError = undefined;
    if (before === undefined) delete process.env.VERCEL; else process.env.VERCEL = before;
  }
});

test("云封面缺PNG返回诚实200SVG占位，仍为私有不缓存的已授权版本", async () => {
  const before = process.env.VERCEL; process.env.VERCEL = "1";
  try {
    const response = await GET(new Request(`https://app.example/api/projects/${projectId}/thumbnail?version=1`), { params: Promise.resolve({ projectId }) });
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type")!, /^image\/svg\+xml/);
    assert.equal(response.headers.get("x-atoms-thumbnail-state"), "unavailable");
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    assert.equal(response.headers.get("x-project-version"), "1");
    const body = await response.text();
    assert.match(body, /封面暂未生成/);
    assert.match(body, /<svg\b/);
    assert.doesNotMatch(body, /<script|<image|href=|真实截图/);
  } finally { if (before === undefined) delete process.env.VERCEL; else process.env.VERCEL = before; }
});

test("已有云PNG保持原字节，未登录和其他账号仍不能拿到占位图", async () => {
  const before = process.env.VERCEL; process.env.VERCEL = "1";
  const request = () => GET(new Request(`https://app.example/api/projects/${projectId}/thumbnail?version=1`), { params: Promise.resolve({ projectId }) });
  try {
    thumbnail = png.toString("base64");
    const response = await request();
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "image/png");
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), png);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    loggedIn = false; assert.equal((await request()).status, 401);
    loggedIn = true; authorized = false; assert.equal((await request()).status, 404);
    authorized = true;
    assert.equal((await GET(new Request(`https://app.example/api/projects/${projectId}/thumbnail?version=2`), { params: Promise.resolve({ projectId }) })).status, 400);
  } finally {
    loggedIn = true; authorized = true; thumbnail = undefined;
    if (before === undefined) delete process.env.VERCEL; else process.env.VERCEL = before;
  }
});
