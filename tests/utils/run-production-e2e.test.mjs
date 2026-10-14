import assert from "node:assert/strict";
import test from "node:test";

test("生产临时账号runner在任务失败和清理reject后仍清理两新账号且保留原异常", async () => {
  const module = await import("./run-production-e2e.mjs").catch(() => null);
  assert.ok(module, "缺少可复用生产临时账号runner");
  const users = new Set(), projects = new Map(), removed = [];
  let next = 0;
  const admin = {
    auth: { admin: {
      createUser: async ({ email, password, email_confirm }) => {
        assert.match(email, /^atoms-production-[0-9a-f-]+@example\.invalid$/);
        assert.ok(password.length >= 20); assert.equal(email_confirm, true);
        const id = `123e4567-e89b-42d3-a456-42661417400${++next}`;
        users.add(id); projects.set(id, [{ id: `223e4567-e89b-42d3-a456-42661417400${next}` }]);
        return { data: { user: { id } }, error: null };
      },
      deleteUser: async id => { removed.push(id); users.delete(id); return { error: null }; },
    } },
    from: () => ({
      select: () => ({ eq: async (_column, id) => ({ data: projects.get(id), error: null }) }),
      delete: () => ({ eq: (_column, id) => ({ eq: async (_ownerColumn, owner) => {
        assert.ok(projects.get(owner).some(project => project.id === id));
        projects.delete(owner); return { error: null };
      } }) }),
    }),
    storage: { from: () => ({ list: async () => { throw Error("storage unavailable"); } }) },
  };
  const original = Error("original task failure");
  let cleanupFailures = 0, manifest;
  await assert.rejects(module.withTemporaryProductionUsers({ admin, makeClient: () => ({}), onCleanup: (count, value) => { cleanupFailures = count; manifest = value; } }, async fixtures => {
    assert.equal(fixtures.length, 2); throw original;
  }), error => error === original);
  assert.equal(users.size, 0); assert.equal(projects.size, 0); assert.equal(removed.length, 2);
  assert.equal(cleanupFailures, 2);
  assert.deepEqual(manifest, [
    { ownerId: "123e4567-e89b-42d3-a456-426614174001", projectId: "223e4567-e89b-42d3-a456-426614174001", step: "removeArtifacts" },
    { ownerId: "123e4567-e89b-42d3-a456-426614174002", projectId: "223e4567-e89b-42d3-a456-426614174002", step: "removeArtifacts" },
  ]);
});

test("生产子进程只拿临时邮箱密码，管理凭据不继承且日志能力token被遮盖", async () => {
  const module = await import("./run-production-e2e.mjs").catch(() => null);
  assert.ok(module, "缺少生产runner隔离");
  const env = module.playwrightEnvironment({ PATH: "/bin", HOME: "/tmp/test-home", https_proxy: "http://127.0.0.1:8080", NEXT_PUBLIC_SUPABASE_URL: "https://jvnweimexkigooqvagfz.supabase.co", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "public-key", CUSTOM_CREDENTIAL: "unclassified-secret", SUPABASE_SERVICE_ROLE_KEY: "admin-secret", SUPABASE_ACCESS_TOKEN: "management-secret", VERCEL_OIDC_TOKEN: "oidc-secret", VERCEL_TOKEN: "legacy-token", OPENAI_API_KEY: "model-secret", ATOMS_VERCEL_API_TOKEN: "vercel-secret", E2E_SIGNUP_EMAIL: "real@example.com" }, [{ email: "temporary-one", password: "password-one" }, { email: "temporary-two", password: "password-two" }]);
  assert.equal(env.E2E_PRIMARY_EMAIL, "temporary-one"); assert.equal(env.E2E_OTHER_PASSWORD, "password-two");
  for (const key of ["CUSTOM_CREDENTIAL", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_ACCESS_TOKEN", "VERCEL_OIDC_TOKEN", "VERCEL_TOKEN", "OPENAI_API_KEY", "ATOMS_VERCEL_API_TOKEN", "E2E_SIGNUP_EMAIL"]) assert.equal(env[key], undefined);
  assert.equal(env.PATH, "/bin"); assert.equal(env.https_proxy, "http://127.0.0.1:8080");
  assert.equal(env.ATOMS_E2E_SKIP_LOCAL_ENV, "1");
  assert.equal(env.ATOMS_E2E_BASE_URL, "https://atoms-demo-jiaqi.vercel.app");
  assert.equal(env.E2E_REAL_MODEL, "1");
  const syntheticToken = "sbp_" + "a".repeat(40);
  const output = module.redactProductionDiagnostic(`?grant=secret-capability&token=signed-object eyJaaa.eyJbbb.signature ${syntheticToken}`);
  assert.doesNotMatch(output, /secret-capability|signed-object|eyJaaa|sbp_/);
});

test("生产Playwright子进程限制30分钟并只返回计数和脱敏失败摘要", async () => {
  const module = await import("./run-production-e2e.mjs");
  assert.equal(typeof module.runPlaywrightChild, "function", "缺少有时限的生产子进程边界");
  const output = module.runPlaywrightChild(["tests/e2e/phase2-auth-persistence.spec.ts"], {}, (command, args, options) => {
    assert.equal(command, process.execPath);
    assert.equal(args.at(-1), "--reporter=json");
    assert.equal(options.timeout, 30 * 60 * 1000);
    assert.equal(options.killSignal, "SIGKILL");
    return { status: 1, stdout: JSON.stringify({ stats: { expected: 1, unexpected: 1, skipped: 1, flaky: 0 }, errors: [{ message: "iframe ?grant=never-print" }] }), stderr: "raw-secret", error: undefined };
  });
  assert.equal(output.playwrightExitCode, 1); assert.equal(output.failed, 1);
  assert.doesNotMatch(JSON.stringify(output), /never-print|raw-secret/);
  assert.throws(() => module.runPlaywrightChild([], {}, () => ({ status: null, error: Error("raw-secret") })), /异常退出/);
});

test("诊断preview匿名200必须含fixture标记，302外跳不能伪称页面可加载", async () => {
  const module = await import("./run-production-e2e.mjs");
  assert.equal(typeof module.probeAnonymousPreview, "function", "缺少真实匿名预览加载诊断");
  const id = "123e4567-e89b-42d3-a456-426614174002";
  const url = `https://atoms-app-${id}.vercel.app/api/preview/${id}/?grant=never-print`;
  const blocked = await module.probeAnonymousPreview(url, id, async (_url, init) => {
    assert.equal(init.redirect, "manual"); assert.equal(init.credentials, "omit");
    assert.equal(new Headers(init.headers).has("cookie"), false);
    assert.equal(new Headers(init.headers).has("authorization"), false);
    return new Response(null, { status: 302, headers: { location: "https://vercel.com/sso-api?token=never-print" } });
  });
  assert.deepEqual(blocked, { previewHttpStatus: 302, fixtureRendered: false, previewFailure: "redirect_blocked" });
  const ready = await module.probeAnonymousPreview(url, id, async () => new Response("<!doctype html><main>Diagnostic fixture, not AI output</main>", { headers: { "content-type": "text/html; charset=utf-8" } }));
  assert.deepEqual(ready, { previewHttpStatus: 200, fixtureRendered: true });
  assert.doesNotMatch(JSON.stringify(blocked), /https|never-print/);
});

test("诊断preview只允许一次同origin同项目308尾slash规范化", async () => {
  const module = await import("./run-production-e2e.mjs");
  assert.equal(typeof module.probeAnonymousPreview, "function", "缺少受限canonical跳转诊断");
  const id = "123e4567-e89b-42d3-a456-426614174002";
  const base = `https://atoms-app-${id}.vercel.app`, path = `/api/preview/${id}`;
  let requests = 0;
  const result = await module.probeAnonymousPreview(`${base}${path}/?grant=never-print`, id, async url => {
    requests++;
    if (requests === 1) return new Response(null, { status: 308, headers: { location: `${path}?grant=never-print` } });
    assert.equal(url, `${base}${path}?grant=never-print`);
    return new Response("Diagnostic fixture, not AI output", { headers: { "content-type": "text/html" } });
  });
  assert.equal(requests, 2); assert.deepEqual(result, { previewHttpStatus: 200, fixtureRendered: true });
  for (const location of ["https://vercel.com/sso", "/api/preview/other-project", `${path}?grant=changed`]) {
    let count = 0;
    const refused = await module.probeAnonymousPreview(`${base}${path}/?grant=never-print`, id, async () => { count++; return new Response(null, { status: 308, headers: { location } }); });
    assert.equal(count, 1); assert.equal(refused.fixtureRendered, false);
  }
  const invalid = await module.probeAnonymousPreview("https://evil.example/?grant=never-print", id, async () => { throw Error("must not fetch invalid origin"); });
  assert.equal(invalid.previewFailure, "invalid_preview_url");
});

test("失败摘要遮盖Cookie/Authorization整值和Supabase SSR编码及分块值", async () => {
  const { redactProductionDiagnostic, runPlaywrightChild } = await import("./run-production-e2e.mjs");
  assert.equal(redactProductionDiagnostic("Timeout 30000ms exceeded while reading projects"), "Timeout 30000ms exceeded while reading projects");
  const samples = [
    "request headers:\n  - Cookie: sb-fixture-auth-token=base64-eyJzZXNzaW9uIjoic3ludGhldGljIn0; other=synthetic-cookie-secret\n  - Authorization: Bearer opaque-synthetic-secret",
    '{"headers":{"Cookie":"sb-fixture-auth-token=base64-eyJzZXNzaW9uIjoic3ludGhldGljIn0; other=synthetic-cookie-secret","Authorization":"Basic synthetic-basic-secret"}}',
    "Set-Cookie: sb-fixture-auth-token.1=synthetic-chunk-secret; HttpOnly\nbase64-eyJzZXNzaW9uIjoic3ludGhldGljIn0\nsb-fixture-auth-token.1=synthetic-chunk-secret",
    "{'cookie': 'synthetic-cookie-secret', 'authorization': 'Bearer opaque-synthetic-secret'}",
    'sb-fixture-auth-token.1="synthetic-chunk-secret"',
    JSON.stringify(JSON.stringify({ Cookie: "synthetic-cookie-secret" })),
    JSON.stringify({ headers: [
      { name: "Cookie", value: "sb-fixture-auth-token.1=synthetic-chunk-secret; other=synthetic-cookie-secret" },
      { name: "Authorization", value: "Basic synthetic-basic-secret" },
    ] }),
  ];
  for (const sample of samples) {
    const output = redactProductionDiagnostic(sample);
    assert.doesNotMatch(output, /eyJzZXNzaW9u|synthetic-cookie-secret|opaque-synthetic-secret|synthetic-basic-secret|synthetic-chunk-secret/);
    const result = runPlaywrightChild([], {}, () => ({ status: 1, stdout: JSON.stringify({ stats: { expected: 0, unexpected: 1, skipped: 0, flaky: 0 }, errors: [{ message: sample }] }), stderr: "", error: undefined }));
    assert.doesNotMatch(JSON.stringify(result.failureSummary), /eyJzZXNzaW9u|synthetic-cookie-secret|opaque-synthetic-secret|synthetic-basic-secret|synthetic-chunk-secret/);
  }
});
