import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";

const image = (width = 960, height = 600) => sharp(Buffer.from(`<svg width="${width}" height="${height}"><rect width="480" height="600" fill="#dc2626"/><rect x="480" width="480" height="600" fill="#2563eb"/></svg>`)).png().toBuffer();

test("封面验收拒绝SVG占位、错误尺寸与空白PNG，接受真实红蓝诊断截图", async () => {
  const module = await import("./run-thumbnail-e2e.mjs").catch(() => null);
  assert.equal(typeof module?.assertThumbnailResponse, "function", "缺少真实PNG验收边界");
  const response = bytes => new Response(bytes, { headers: { "Content-Type": "image/png", "Cache-Control": "private, no-store", "X-Project-Version": "1" } });
  const bytes = await image();
  assert.deepEqual(await module.assertThumbnailResponse(response(bytes)), bytes);
  await assert.rejects(module.assertThumbnailResponse(new Response("<svg/>", { headers: { "Content-Type": "image/svg+xml" } })), /PNG/);
  await assert.rejects(module.assertThumbnailResponse(response(await image(480, 300))), /960/);
  await assert.rejects(module.assertThumbnailResponse(response(await sharp({ create: { width: 960, height: 600, channels: 3, background: "white" } }).png().toBuffer())), /红蓝/);
});

test("封面验收拒绝错误HTTP、公开缓存或错误版本，不能把失败写为截图成功", async () => {
  const module = await import("./run-thumbnail-e2e.mjs");
  const bytes = await image();
  await assert.rejects(module.assertThumbnailResponse(new Response(bytes, { status: 503 })), /HTTP/);
  for (const headers of [
    { "Content-Type": "image/png", "Cache-Control": "public", "X-Project-Version": "1" },
    { "Content-Type": "image/png", "Cache-Control": "private, no-store", "X-Project-Version": "2" },
  ]) await assert.rejects(module.assertThumbnailResponse(new Response(bytes, { headers })), /缓存|版本/);
});

test("封面首页浏览器不继承模型或管理secret，仅传必要系统环境及显式代理", async () => {
  const module = await import("./run-thumbnail-e2e.mjs");
  assert.equal(typeof module.thumbnailBrowserOptions, "function", "缺少浏览器进程凭据隔离边界");
  const options = module.thumbnailBrowserOptions({ PATH: "/bin", HOME: "/tmp/diagnostic", TMPDIR: "/tmp/fixture", LLM_API_KEY: "synthetic-model-secret", VERCEL_TOKEN: "synthetic-admin-secret", CUSTOM_SECRET: "synthetic-unknown-secret", https_proxy: "http://127.0.0.1:8080" });
  assert.deepEqual(options.env, { PATH: "/bin", HOME: "/tmp/diagnostic", TMPDIR: "/tmp/fixture" });
  assert.deepEqual(options.proxy, { server: "http://127.0.0.1:8080" });
  assert.doesNotMatch(JSON.stringify(options), /synthetic-(model|admin|unknown)-secret/);
});

test("冷封面请求覆盖300秒生产截止及传输余量，缓存重读仍仅20秒", async () => {
  const module = await import("./run-thumbnail-e2e.mjs");
  assert.equal(typeof module.requestThumbnailPng, "function", "缺少区分冷构建与缓存请求的预算边界");
  const timeout = AbortSignal.timeout, budgets = [];
  AbortSignal.timeout = milliseconds => { budgets.push(milliseconds); return new AbortController().signal; };
  try {
    const bytes = await image();
    const request = async (_url, init) => {
      assert.equal(init.redirect, "error");
      assert.deepEqual(init.headers, { Cookie: "synthetic-cookie-value" });
      return new Response(bytes, { headers: { "Content-Type": "image/png", "Cache-Control": "private, no-store", "X-Project-Version": "1" } });
    };
    await module.requestThumbnailPng("https://example.invalid/thumbnail", { Cookie: "synthetic-cookie-value" }, true, request);
    await module.requestThumbnailPng("https://example.invalid/thumbnail", { Cookie: "synthetic-cookie-value" }, false, request);
    assert.deepEqual(budgets, [320000, 20000]);
  } finally { AbortSignal.timeout = timeout; }
});
