import assert from "node:assert/strict";
import test from "node:test";

const id = "123e4567-e89b-42d3-a456-426614174000";
const host = "atoms-app-123e4567-e89b-42d3-a456-426614174000.vercel.app";
const projectId = "prj_Qy0ugq79jGkv9gAGc1vVeNtMpdkm";
const teamId = "team_t41qF1poOXtcPYCh009TSUpt";
const deploymentId = "dpl_testAtoms";
async function subject() {
  const module = await import("../../lib/cloud/preview-domain.ts").catch(() => null);
  assert.ok(module, "缺少稳定预览域名模块");
  return module;
}
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
function boundary(responses: Response[]) {
  const requests: { url: string; init?: RequestInit }[] = [];
  const fetcher: typeof fetch = async (url, init) => {
    requests.push({ url: String(url), init });
    assert.equal(new URL(String(url)).origin, "https://api.vercel.com");
    assert.equal(new URL(String(url)).searchParams.get("teamId"), teamId);
    assert.equal(new Headers(init?.headers).get("authorization"), "Bearer test-management-token");
    const response = responses.shift();
    assert.ok(response, "不应发送额外管理请求");
    return response;
  };
  return { requests, fetcher };
}
const deployment = { id: deploymentId, projectId, readyState: "READY" };
const alias = { uid: "alias_test", alias: host, projectId, deploymentId };

test("完整UUID生成稳定独立origin并拒绝非法项目ID", async () => {
  const { previewHost, previewOrigin } = await subject();
  assert.equal(previewHost(id), host);
  assert.equal(previewOrigin(id), `https://${host}`);
  assert.notEqual(previewOrigin("423e4567-e89b-42d3-a456-426614174000"), `https://${host}`);
  for (const value of ["../project", "short", id.toUpperCase()]) assert.throws(() => previewHost(value));
});

test("确认Atoms部署与alias归属后已绑定同部署不重复写平台", async () => {
  const { ensurePreviewAlias } = await subject();
  const { requests, fetcher } = boundary([json(deployment), json(alias)]);
  assert.equal(await ensurePreviewAlias(id, deploymentId, { token: "test-management-token", fetch: fetcher }), `https://${host}`);
  assert.equal(requests.length, 2);
  assert.ok(requests.every(request => (request.init?.method ?? "GET") === "GET"));
});

test("不存在alias时绑定显式部署并重新核对最终归属", async () => {
  const { bindPreviewAlias } = await subject();
  assert.equal(typeof bindPreviewAlias, "function", "缺少明确的运维绑定入口");
  const { requests, fetcher } = boundary([json(deployment), json({}, 404), json({ uid: "alias_test", alias: host }), json(alias)]);
  assert.equal(await bindPreviewAlias(id, deploymentId, { token: "test-management-token", fetch: fetcher }), `https://${host}`);
  assert.equal(requests[2].init?.method, "POST");
  assert.equal(new URL(requests[2].url).pathname, `/v2/deployments/${deploymentId}/aliases`);
  assert.deepEqual(JSON.parse(requests[2].init?.body as string), { alias: host });
});

test("拒绝其他项目alias和其他项目或未READY部署，完全不发送POST", async () => {
  const { ensurePreviewAlias, bindPreviewAlias } = await subject();
  for (const entry of [ensurePreviewAlias, bindPreviewAlias]) {
    for (const responses of [[json({ ...deployment, projectId: "prj_other" })], [json({ ...deployment, readyState: "BUILDING" })], [json(deployment), json({ ...alias, projectId: "prj_other" })]]) {
      const { requests, fetcher } = boundary(responses);
      await assert.rejects(entry(id, deploymentId, { token: "test-management-token", fetch: fetcher }));
      assert.ok(requests.every(request => (request.init?.method ?? "GET") === "GET"));
    }
  }
});

test("管理失败与伪成功响应均不得返回可用origin", async () => {
  const { bindPreviewAlias } = await subject();
  assert.equal(typeof bindPreviewAlias, "function", "缺少明确的运维绑定入口");
  for (const responses of [[json({}, 403)], [json(deployment), json({}, 403)], [json(deployment), json({}, 404), json({ error: "conflict" }, 409)], [json(deployment), json({}, 404), json({ alias: host, uid: "alias_test" }), json({ ...alias, deploymentId: "dpl_other" })], [json(deployment), json({ ...alias, redirect: "evil.example" })]]) {
    const { fetcher } = boundary(responses);
    await assert.rejects(bindPreviewAlias(id, deploymentId, { token: "test-management-token", fetch: fetcher }));
  }
});

test("运行时只核验现有绑定，缺失或旧部署alias均拒绝自动POST", async () => {
  const { ensurePreviewAlias } = await subject();
  for (const response of [json({}, 404), json({ ...alias, deploymentId: "dpl_previous" })]) {
    const { requests, fetcher } = boundary([json(deployment), response]);
    await assert.rejects(ensurePreviewAlias(id, deploymentId, { token: "test-management-token", fetch: fetcher }), /绑定|部署/);
    assert.equal(requests.length, 2);
    assert.ok(requests.every(request => (request.init?.method ?? "GET") === "GET"));
  }
});

test("浏览器不能使用域名管理凭据发请求", async () => {
  const { ensurePreviewAlias, bindPreviewAlias } = await subject();
  const previous = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", { value: {}, configurable: true });
  let requests = 0;
  try {
    for (const entry of [ensurePreviewAlias, bindPreviewAlias]) {
      await assert.rejects(entry(id, deploymentId, {
        token: "test-management-token", fetch: async () => { requests++; return json(deployment); },
      }), /服务端/);
    }
    assert.equal(requests, 0);
  } finally {
    if (previous) Object.defineProperty(globalThis, "window", previous);
    else Reflect.deleteProperty(globalThis, "window");
  }
});
