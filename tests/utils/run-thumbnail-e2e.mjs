import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { uploadArtifact, ARTIFACT_BUCKET } from "../../lib/cloud/artifacts.ts";
import { saveCloudProjectSnapshot, withProjectLease } from "../../lib/cloud/project-lease.ts";
import { loadPersistedProject, loadProjectVersion } from "../../lib/persistence/project-store.ts";
import { projectThumbnailId } from "../../lib/cloud/project-thumbnail.ts";
import { redactProductionDiagnostic, withTemporaryProductionUsers } from "./run-production-e2e.mjs";

const REF = "jvnweimexkigooqvagfz";
const ORIGIN = "https://atoms-demo-jiaqi.vercel.app";
const MARKER = "THUMBNAIL DIAGNOSTIC — NOT AI OUTPUT";
const CSS = "html,body,#root{margin:0;width:100%;height:100%;}main{height:100vh;background:linear-gradient(to right,#dc2626 0%,#dc2626 50%,#2563eb 50%,#2563eb 100%);display:grid;place-items:center;color:white;font:700 24px sans-serif;}";

// These are synthetic non-AI apps; no model invocation, old user data or admin app runtime.
export async function assertThumbnailResponse(response) {
  assert.equal(response.status, 200, "封面HTTP必须200");
  assert.match(response.headers.get("content-type") ?? "", /^image\/png(?:;|$)/i, "必须真实PNG，不接受SVG占位");
  assert.match(response.headers.get("cache-control") ?? "", /private/, "封面必须私有缓存");
  assert.match(response.headers.get("cache-control") ?? "", /no-store/, "封面必须no-store缓存");
  assert.equal(response.headers.get("x-project-version"), "1", "封面版本必须保持v1");
  const bytes = Buffer.from(await response.arrayBuffer());
  assert.ok(bytes.length <= 1024 * 1024, "PNG不得超过1MiB");
  const metadata = await sharp(bytes).metadata();
  assert.equal(metadata.format, "png", "封面必须可解码PNG");
  assert.equal(metadata.width, 960, "截图宽度必须960");
  assert.equal(metadata.height, 600, "截图高度必须600");
  const { data, info } = await sharp(bytes).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  for (const [x, expected] of [[100, [220, 38, 38]], [860, [37, 99, 235]]]) {
    const offset = (100 * info.width + x) * info.channels;
    assert.ok(expected.every((channel, index) => Math.abs(data[offset + index] - channel) <= 3), "截图必须实际渲染红蓝诊断设计");
  }
  return bytes;
}

export async function requestThumbnailPng(endpoint, headers, cold, request = fetch) {
  return assertThumbnailResponse(await request(endpoint, { headers, redirect: "error", signal: AbortSignal.timeout(cold ? 320000 : 20000) }));
}

function checked(result) {
  if (result.error) throw new Error("封面诊断数据操作失败");
  return result.data;
}

async function session(user, url, key, request) {
  const cookies = new Map();
  const client = createServerClient(url, key, { global: { fetch: request }, cookies: {
    getAll: () => [...cookies].map(([name, value]) => ({ name, value })),
    setAll: values => { for (const { name, value } of values) cookies.set(name, value); },
  } });
  checked(await client.auth.signInWithPassword({ email: user.email, password: user.password }));
  return { client, cookies, headers: () => ({ Cookie: [...cookies].map(([name, value]) => `${name}=${value}`).join("; ") }) };
}

async function fixture(user, client, legacy) {
  const projectId = randomUUID(), runId = randomUUID(), at = new Date().toISOString();
  user.projectIds.push(projectId);
  const name = legacy ? "旧源码封面诊断（非AI）" : "云产物封面诊断（非AI）";
  checked(await client.from("projects").insert({ id: projectId, owner_id: user.id, name }));
  const files = [{ path: "src/App.tsx", content: `export default function App(){return <main>${MARKER}</main>}` }, { path: "src/styles.css", content: CSS }];
  await withProjectLease(client, projectId, async lease => {
    const artifactPath = legacy ? undefined : await uploadArtifact(client, projectId, runId, { files: [{ path: "index.html", contentType: "text/html", content: Buffer.from(`<!doctype html><html><head><meta charset="utf-8"><style>${CSS}</style></head><body><div id="root"><main>${MARKER}</main></div></body></html>`).toString("base64") }] });
    assert.equal(await saveCloudProjectSnapshot(client, lease, {
      projectId, expectedVersion: 0, projectName: name, summary: "真实封面诊断fixture，不是AI模型验收", files,
      messages: [{ id: randomUUID(), role: "user", content: "红蓝静态封面诊断fixture（非AI）", created_at: at, turn_id: runId, sequence: 0 }, { id: randomUUID(), role: "assistant", content: "保存诊断fixture，用于真实截图验收。", created_at: at, turn_id: runId, sequence: 1 }],
      run: { id: runId, mode: "create", requirement: "诊断fixture，非AI输出", status: "completed", model: "diagnostic", events: [{ event: "complete", at, data: { projectId, version: 1, ...(artifactPath ? { artifactPath } : {}), previewReady: false } }], startedAt: at, completedAt: at, buildAttempts: legacy ? 1 : 0 },
    }), 1);
  });
  return { projectId, legacy };
}

async function savedState(client, projectId) {
  const bundle = await loadPersistedProject(client, projectId);
  assert.equal(bundle.project.current_version, 1);
  assert.deepEqual(bundle.messages.map(message => message.role), ["user", "assistant"]);
  assert.equal(bundle.runs.length, 1);
  assert.equal(bundle.runs[0].status, "completed");
  assert.equal(bundle.runs[0].version, 1);
  bundle.files.sort((a, b) => a.path.localeCompare(b.path));
  return { bundle, version: await loadProjectVersion(client, projectId, 1) };
}

async function cachedPng(client, ownerId, projectId, png) {
  const bucket = client.storage.from(ARTIFACT_BUCKET);
  const path = `${ownerId}/${projectId}/${projectThumbnailId(projectId, 1)}.json`;
  // Read exactly this fresh user's UUIDv5 version cache, never scan the bucket.
  const blob = checked(await bucket.download(path));
  assert.ok(blob.size <= 2 * 1024 * 1024);
  const cache = JSON.parse(await blob.text());
  assert.deepEqual(Object.keys(cache).sort(), ["thumbnail", "version"]);
  assert.equal(cache.version, 1);
  assert.equal(typeof cache.thumbnail, "string");
  assert.deepEqual(Buffer.from(cache.thumbnail, "base64"), png, "私有Storage必须保存同一PNG缓存");
  return path;
}

export function thumbnailBrowserOptions(env) {
  const proxyValue = env.https_proxy ?? env.HTTPS_PROXY;
  const proxy = proxyValue ? new URL(proxyValue) : null;
  return { headless: true, timeout: 20000, env: { PATH: env.PATH ?? "", HOME: env.HOME ?? "", TMPDIR: env.TMPDIR ?? "/private/tmp" }, ...(proxy ? { proxy: { server: proxy.origin, ...(proxy.username ? { username: decodeURIComponent(proxy.username), password: decodeURIComponent(proxy.password) } : {}) } } : {}) };
}

async function homeCards(owner, fixtures) {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch(thumbnailBrowserOptions(process.env));
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: "block" });
    await context.addCookies([...owner.cookies].map(([name, value]) => ({ name, value, url: ORIGIN, secure: true, sameSite: "Lax" })));
    const page = await context.newPage();
    let consoleErrors = 0, badResponses = 0, automaticThumbnails = 0;
    page.on("pageerror", () => consoleErrors++);
    page.on("console", message => { if (message.type() === "error") consoleErrors++; });
    page.on("response", response => { if (response.status() >= 400) badResponses++; });
    page.on("request", request => { if (/\/api\/projects\/[^/]+\/thumbnail$/.test(new URL(request.url()).pathname)) automaticThumbnails++; });
    await page.goto(ORIGIN, { waitUntil: "networkidle", timeout: 60000 });
    for (const { projectId } of fixtures) {
      const card = page.locator(`.home-project-card[href="/?project=${projectId}"]`);
      await card.scrollIntoViewIfNeeded({ timeout: 20000 });
      await card.getByRole("img", { name: "统一项目封面", exact: true }).waitFor({ timeout: 20000 });
      assert.equal(await card.locator("img").count(), 0, "统一卡面不得恢复截图网络依赖");
    }
    assert.equal(automaticThumbnails, 0, "首页不得自动调用保留的截图API");
    assert.equal(consoleErrors, 0, "首页不应有console错误");
    assert.equal(badResponses, 0, "正常首页不应有4xx/5xx");
    return { homeCards: fixtures.length, consoleErrors, badResponses };
  } finally { await browser.close(); }
}

export async function runThumbnailDiagnostic({ admin, url, key, request = fetch, browserCheck = homeCards }) {
  assert.equal(url, `https://${REF}.supabase.co`, "拒绝其他Supabase项目");
  let cleanupFailures = 0, cleanupManifest = [];
  try {
    return await withTemporaryProductionUsers({ admin, onCleanup: (count, manifest) => { cleanupFailures = count; cleanupManifest = manifest; } }, async users => {
      const owner = await session(users[0], url, key, request), foreign = await session(users[1], url, key, request);
      const fixtures = [await fixture(users[0], owner.client, false), await fixture(users[0], owner.client, true)];
      const directory = await mkdtemp("/private/tmp/atoms-thumbnail-diagnostic-");
      for (const { projectId, legacy } of fixtures) {
        const before = await savedState(owner.client, projectId);
        const endpoint = `${ORIGIN}/api/projects/${projectId}/thumbnail?version=1`;
        const png = await requestThumbnailPng(endpoint, owner.headers(), true, request);
        const cached = await requestThumbnailPng(endpoint, owner.headers(), false, request);
        assert.deepEqual(cached, png, "第二次HTTP必须读取同一PNG缓存");
        const cachePath = await cachedPng(owner.client, users[0].id, projectId, png);
        const denied = await request(endpoint, { headers: foreign.headers(), redirect: "error", signal: AbortSignal.timeout(20000) });
        assert.equal(denied.status, 404, "其他账号不得读取封面");
        await denied.body?.cancel();
        assert.ok((await foreign.client.storage.from(ARTIFACT_BUCKET).download(cachePath)).error, "其他账号不得读取私有PNG缓存");
        assert.deepEqual(await savedState(owner.client, projectId), before, "截图不得改变项目元数据、版本、源码、聊天或run");
        await writeFile(join(directory, legacy ? "legacy.png" : "cloud.png"), png, { mode: 0o600 });
      }
      const browser = await browserCheck(owner, fixtures);
      return { mode: "thumbnail-diagnostic-non-ai", scenarios: 2, version: 1, ...browser, screenshotDirectory: directory, temporaryUsers: 2, cleanupFailures: 0 };
    });
  } finally {
    if (cleanupFailures) console.error(JSON.stringify({ cleanupFailures, cleanupManifest }));
  }
}

async function main() {
  assert.equal(process.argv[2], "--run", "仅显式--run执行真实诊断");
  assert.equal((await readFile(new URL("../../supabase/.temp/project-ref", import.meta.url), "utf8")).trim(), REF);
  // Root loads the existing public env and installs EnvHttpProxyAgent before importing.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  assert.equal(url, `https://${REF}.supabase.co`); assert.ok(key, "缺少公开Supabase配置");
  const captured = spawnSync("supabase", ["projects", "api-keys", "--project-ref", REF, "-o", "json"], { encoding: "utf8", timeout: 30000, stdio: ["ignore", "pipe", "pipe"] });
  if (captured.status !== 0) throw new Error("管理凭据获取失败，不输出CLI原始内容");
  let serviceKey;
  try { serviceKey = JSON.parse(captured.stdout).find(item => item.name === "service_role")?.api_key; } catch { /* Do not expose raw CLI response. */ }
  assert.ok(serviceKey, "缺少临时用户管理凭据");
  const request = (input, init) => fetch(input, { ...init, signal: init?.signal ?? AbortSignal.timeout(20000) });
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: request } });
  console.log(JSON.stringify(await runThumbnailDiagnostic({ admin, url, key, request })));
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  main().catch(() => { console.error(redactProductionDiagnostic("真实封面诊断失败；请求及认证原始详情已省略。")); process.exitCode = 1; });
}
