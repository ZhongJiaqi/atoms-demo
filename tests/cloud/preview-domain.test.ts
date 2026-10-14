import assert from "node:assert/strict";
import test from "node:test";

const id = "123e4567-e89b-42d3-a456-426614174000";
const host = "atoms-app-123e4567-e89b-42d3-a456-426614174000.vercel.app";
const projectId = "prj_Qy0ugq79jGkv9gAGc1vVeNtMpdkm";
const teamId = "team_t41qF1poOXtcPYCh009TSUpt";
const deploymentId = "dpl_testAtoms";
const foreignProjectId = "prj_knownExistingForeign";
// Independently calculated fixture SHA-256; never a real management credential.
const fixtureTokenFingerprint = "794c940e86dacb50d69396c3a373a1d4aa0bf553331be2cdc45dcc655c99a1ac"; // gitleaks:allow -- SHA-256 of literal test-management-token, not a live credential.
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
    const parsed = new URL(String(url));
    assert.equal(parsed.searchParams.get("teamId"), parsed.pathname === "/v5/user/tokens/current" ? null : teamId);
    assert.equal(new Headers(init?.headers).get("authorization"), "Bearer test-management-token");
    const response = responses.shift();
    assert.ok(response, "不应发送额外管理请求");
    return response;
  };
  return { requests, fetcher };
}
const deployment = { id: deploymentId, projectId, readyState: "READY" };
const alias = { uid: "alias_test", alias: host, projectId, deploymentId };
const productionDomain = { name: host, projectId, verified: true, gitBranch: null, customEnvironmentId: null, redirect: null };

function configuredDeny(project: string | undefined): () => void {
  const previous = process.env.ATOMS_SCOPE_DENY_PROJECT_ID;
  if (project === undefined) delete process.env.ATOMS_SCOPE_DENY_PROJECT_ID;
  else process.env.ATOMS_SCOPE_DENY_PROJECT_ID = project;
  return () => {
    if (previous === undefined) delete process.env.ATOMS_SCOPE_DENY_PROJECT_ID;
    else process.env.ATOMS_SCOPE_DENY_PROJECT_ID = previous;
  };
}

function configuredFingerprint(fingerprint: string): () => void {
  const previous = process.env.ATOMS_VERCEL_TOKEN_SHA256;
  process.env.ATOMS_VERCEL_TOKEN_SHA256 = fingerprint;
  return () => {
    if (previous === undefined) delete process.env.ATOMS_VERCEL_TOKEN_SHA256;
    else process.env.ATOMS_VERCEL_TOKEN_SHA256 = previous;
  };
}

test("完整UUID生成稳定独立origin并拒绝非法项目ID", async () => {
  const { previewHost, previewOrigin } = await subject();
  assert.equal(previewHost(id), host);
  assert.equal(previewOrigin(id), `https://${host}`);
  assert.notEqual(previewOrigin("423e4567-e89b-42d3-a456-426614174000"), `https://${host}`);
  for (const value of ["../project", "short", id.toUpperCase()]) assert.throws(() => previewHost(value));
});

test("确认Atoms部署与alias归属后已绑定同部署不重复写平台", async () => {
  const { ensurePreviewAlias } = await subject();
  const { requests, fetcher } = boundary([json(deployment), json(alias), json(productionDomain)]);
  assert.equal(await ensurePreviewAlias(id, deploymentId, { token: "test-management-token", fetch: fetcher }), `https://${host}`);
  assert.equal(requests.length, 3);
  assert.ok(requests.every(request => (request.init?.method ?? "GET") === "GET"));
});

test("不存在alias时绑定显式部署并重新核对最终归属", async () => {
  const { bindPreviewAlias } = await subject();
  assert.equal(typeof bindPreviewAlias, "function", "缺少明确的运维绑定入口");
  const { requests, fetcher } = boundary([json(deployment), json({}, 404), json(productionDomain), json({ uid: "alias_test", alias: host }), json(alias)]);
  assert.equal(await bindPreviewAlias(id, deploymentId, { token: "test-management-token", fetch: fetcher }), `https://${host}`);
  assert.equal(requests[3].init?.method, "POST");
  assert.equal(new URL(requests[3].url).pathname, `/v2/deployments/${deploymentId}/aliases`);
  assert.deepEqual(JSON.parse(requests[3].init?.body as string), { alias: host });
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
  for (const responses of [[json({}, 403)], [json(deployment), json({}, 403)], [json(deployment), json({}, 404), json(productionDomain), json({ error: "conflict" }, 409)], [json(deployment), json({}, 404), json(productionDomain), json({ alias: host, uid: "alias_test" }), json({ ...alias, deploymentId: "dpl_other" })], [json(deployment), json({ ...alias, redirect: "evil.example" })]]) {
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
  const { ensurePreviewAlias, bindPreviewAlias, ensureScopedPreviewAlias } = await subject();
  const previous = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", { value: {}, configurable: true });
  let requests = 0;
  try {
    for (const entry of [ensurePreviewAlias, bindPreviewAlias, ensureScopedPreviewAlias]) {
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

test("自动绑定仅在同Token读取Atoms成功且已存在其他项目403之后POST", async () => {
  const { ensureScopedPreviewAlias } = await subject();
  assert.equal(typeof ensureScopedPreviewAlias, "function", "缺少真实项目权限验证入口");
  const restore = configuredDeny(foreignProjectId);
  try {
    const { requests, fetcher } = boundary([json({ id: projectId }), json({}, 403), json(deployment), json({}, 404), json(productionDomain), json({ uid: "alias_test", alias: host }), json(alias)]);
    const options = { token: "test-management-token", fetch: fetcher, denyProjectId: "prj_clientSelected" };
    assert.equal(await ensureScopedPreviewAlias(id, deploymentId, options), `https://${host}`);
    assert.equal(new URL(requests[0].url).pathname, `/v9/projects/${projectId}`);
    assert.equal(new URL(requests[1].url).pathname, `/v9/projects/${foreignProjectId}`);
    assert.equal(requests[5].init?.method, "POST");
    assert.equal(requests.length, 7);
  } finally { restore(); }
});

test("自身项目错误、其他项目返回200或401都拒绝绑定且零POST", async () => {
  const { ensureScopedPreviewAlias } = await subject();
  assert.equal(typeof ensureScopedPreviewAlias, "function", "缺少真实项目权限验证入口");
  const restore = configuredDeny(foreignProjectId);
  try {
    for (const responses of [[json({}, 403)], [json({ id: "prj_other" })], [json({ id: projectId }), json({ id: foreignProjectId })], [json({ id: projectId }), json({}, 401)]]) {
      const { requests, fetcher } = boundary(responses);
      await assert.rejects(ensureScopedPreviewAlias(id, deploymentId, { token: "test-management-token", fetch: fetcher }));
      assert.ok(requests.every(request => request.init?.method === "GET"));
    }
  } finally { restore(); }
});

test("deny项目必须来自服务器配置，缺失非法或自身ID时零网络请求", async () => {
  const { ensureScopedPreviewAlias } = await subject();
  assert.equal(typeof ensureScopedPreviewAlias, "function", "缺少真实项目权限验证入口");
  for (const deny of [undefined, "prj_x?query=evil", projectId]) {
    const restore = configuredDeny(deny);
    let requests = 0;
    try {
      const options = { token: "test-management-token", denyProjectId: foreignProjectId, fetch: async () => { requests++; return json({ id: projectId }); } };
      await assert.rejects(ensureScopedPreviewAlias(id, deploymentId, options), /ATOMS_SCOPE_DENY_PROJECT_ID/);
      assert.equal(requests, 0);
    } finally { restore(); }
  }
});

test("权限探测失败只报告HTTP状态，不泄漏API错误正文或凭据且不绑定", async () => {
  const { ensureScopedPreviewAlias } = await subject();
  const restore = configuredDeny(foreignProjectId);
  try {
    const { requests, fetcher } = boundary([json({ id: projectId }), json({ error: { message: "sensitive-response-must-not-escape" } }, 401)]);
    await assert.rejects(ensureScopedPreviewAlias(id, deploymentId, { token: "test-management-token", fetch: fetcher }), error => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /HTTP 401/);
      assert.doesNotMatch(error.message, /sensitive-response-must-not-escape|test-management-token/);
      return true;
    });
    assert.ok(requests.every(request => request.init?.method === "GET"));
  } finally { restore(); }
});

test("其他项目404仅凭同HTTP凭据current元数据明确限定Atoms且有效才绑定", async () => {
  const { ensureScopedPreviewAlias } = await subject();
  const restore = configuredDeny(foreignProjectId);
  try {
    const { requests, fetcher } = boundary([json({ id: projectId }), json({}, 404), json({ token: { projectId, expiresAt: Date.now() + 60000 } }), json(deployment), json({}, 404), json(productionDomain), json({ uid: "alias_test", alias: host }), json(alias)]);
    assert.equal(await ensureScopedPreviewAlias(id, deploymentId, { token: "test-management-token", fetch: fetcher }), `https://${host}`);
    assert.equal(new URL(requests[2].url).pathname, "/v5/user/tokens/current");
    assert.equal(requests[6].init?.method, "POST");
    assert.equal(requests.length, 8);
  } finally { restore(); }
});

test("其他项目404但current缺失、非Atoms、被拒、撤销、泄漏或过期时零POST", async () => {
  const { ensureScopedPreviewAlias } = await subject();
  const restore = configuredDeny(foreignProjectId);
  try {
    for (const metadata of [json({}), json({ token: {} }), json({ token: { projectId: "prj_other" } }), json({}, 403), json({}, 404), json({ token: { projectId, expiresAt: Date.now() - 1000 } }), json({ token: { projectId, revokedAt: Date.now() } }), json({ token: { projectId, leakedAt: Date.now() } }), json({ token: { projectId, expiresAt: "not-a-timestamp" } }), json({ token: { projectId, expiresAt: [Date.now() + 60000] } })]) {
      const { requests, fetcher } = boundary([json({ id: projectId }), json({}, 404), metadata]);
      await assert.rejects(ensureScopedPreviewAlias(id, deploymentId, { token: "test-management-token", fetch: fetcher }));
      assert.equal(requests.length, 3, "必须校验当前凭据元数据，不能仅凭404判断");
      assert.ok(requests.every(request => request.init?.method === "GET"));
    }
  } finally { restore(); }
});

test("可信部署指纹匹配后仍核验Atoms与其他项目404，绑定不调用current", async () => {
  const { ensureScopedPreviewAlias } = await subject();
  const restoreDeny = configuredDeny(foreignProjectId);
  const restoreFingerprint = configuredFingerprint(fixtureTokenFingerprint);
  try {
    const { requests, fetcher } = boundary([json({ id: projectId }), json({}, 404), json(deployment), json({}, 404), json(productionDomain), json({ uid: "alias_test", alias: host }), json(alias)]);
    assert.equal(await ensureScopedPreviewAlias(id, deploymentId, { token: "test-management-token", fetch: fetcher }), `https://${host}`);
    assert.equal(requests.length, 7);
    assert.equal(requests[5].init?.method, "POST");
    assert.ok(requests.every(request => new URL(request.url).pathname !== "/v5/user/tokens/current"));
  } finally { restoreFingerprint(); restoreDeny(); }
});

test("同部署alias未登记production domain时只读入口不能假ready或创建域名", async () => {
  const { ensurePreviewAlias } = await subject();
  const { requests, fetcher } = boundary([json(deployment), json(alias), json({}, 404)]);
  await assert.rejects(ensurePreviewAlias(id, deploymentId, { token: "test-management-token", fetch: fetcher }), /域名/);
  assert.equal(requests.length, 3);
  assert.ok(requests.every(request => request.init?.method === "GET"));
});

test("登记production domain后重读alias并修正自动指向latest的部署", async () => {
  const { bindPreviewAlias } = await subject();
  const { requests, fetcher } = boundary([json(deployment), json(alias), json({}, 404), json(productionDomain), json(productionDomain), json({ ...alias, deploymentId: "dpl_latest" }), json({ uid: "alias_test", alias: host }), json(alias)]);
  assert.equal(await bindPreviewAlias(id, deploymentId, { token: "test-management-token", fetch: fetcher }), `https://${host}`);
  assert.equal(requests.length, 8);
  assert.equal(new URL(requests[2].url).pathname, `/v9/projects/${projectId}/domains/${host}`);
  assert.equal(new URL(requests[3].url).pathname, `/v10/projects/${projectId}/domains`);
  assert.equal(requests[3].init?.method, "POST");
  assert.deepEqual(JSON.parse(requests[3].init?.body as string), { name: host });
  assert.equal(requests[6].init?.method, "POST");
  assert.equal(new URL(requests[7].url).pathname, `/v4/aliases/${host}`);
});

test("域名其他项目、未verified、branch、自定义环境或redirect不允许aliasPOST", async () => {
  const { bindPreviewAlias } = await subject();
  for (const domain of [{ ...productionDomain, projectId: "prj_other" }, { ...productionDomain, name: "other.vercel.app" }, { ...productionDomain, verified: false }, { ...productionDomain, gitBranch: "preview" }, { ...productionDomain, customEnvironmentId: "env_test" }, { ...productionDomain, redirect: "vercel.com" }]) {
    const { requests, fetcher } = boundary([json(deployment), json(alias), json(domain)]);
    await assert.rejects(bindPreviewAlias(id, deploymentId, { token: "test-management-token", fetch: fetcher }));
    assert.equal(requests.length, 3);
    assert.ok(requests.every(request => request.init?.method === "GET"));
  }
});

test("登记域名失败或回读错误不能假ready也不能继续aliasPOST", async () => {
  const { bindPreviewAlias } = await subject();
  for (const responses of [[json({}, 403)], [json({ ...productionDomain, verified: false })], [json(productionDomain), json({}, 403)], [json(productionDomain), json({ ...productionDomain, gitBranch: "preview" })]]) {
    const { requests, fetcher } = boundary([json(deployment), json(alias), json({}, 404), ...responses]);
    await assert.rejects(bindPreviewAlias(id, deploymentId, { token: "test-management-token", fetch: fetcher }));
    assert.equal(requests.filter(request => request.init?.method === "POST" && new URL(request.url).pathname.includes("/deployments/")).length, 0);
  }
});

test("错误、非法或空部署指纹必须在任何网络请求前拒绝，不能fallback", async () => {
  const { ensureScopedPreviewAlias } = await subject();
  const restoreDeny = configuredDeny(foreignProjectId);
  try {
    for (const fingerprint of ["0".repeat(64), "g".repeat(64), "abcd", ""]) {
      const restoreFingerprint = configuredFingerprint(fingerprint);
      let requests = 0;
      try {
        await assert.rejects(ensureScopedPreviewAlias(id, deploymentId, { token: "test-management-token", fetch: async () => { requests++; return json({ id: projectId }); } }), /指纹/);
        assert.equal(requests, 0);
      } finally { restoreFingerprint(); }
    }
  } finally { restoreDeny(); }
});

test("指纹匹配不能跳过自身项目身份或接受其他项目200及401", async () => {
  const { ensureScopedPreviewAlias } = await subject();
  const restoreDeny = configuredDeny(foreignProjectId);
  const restoreFingerprint = configuredFingerprint(fixtureTokenFingerprint);
  try {
    for (const responses of [[json({ id: "prj_other" })], [json({ id: projectId }), json({ id: foreignProjectId })], [json({ id: projectId }), json({}, 401)]]) {
      const { requests, fetcher } = boundary(responses);
      await assert.rejects(ensureScopedPreviewAlias(id, deploymentId, { token: "test-management-token", fetch: fetcher }));
      assert.ok(requests.every(request => request.init?.method === "GET"));
    }
  } finally { restoreFingerprint(); restoreDeny(); }
});
