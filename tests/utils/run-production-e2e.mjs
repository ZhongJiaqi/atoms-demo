import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cleanupCloudFixture } from "../agent/test-utils/cloud-cleanup.ts";
import { uploadArtifact } from "../../lib/cloud/artifacts.ts";
import { withProjectLease, saveCloudProjectSnapshot } from "../../lib/cloud/project-lease.ts";

const REF = "jvnweimexkigooqvagfz";
const ORIGIN = "https://atoms-demo-jiaqi.vercel.app";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function redactProductionDiagnostic(value) {
  const text = String(value);
  // Header dumps can be quoted, escaped or name/value arrays: omit the entire
  // diagnostic rather than try to parse every serialization of authentication.
  if (/\bcookies?\b|\bauthorization\b|auth-token|base64-/i.test(text)) return "[敏感认证请求详情已省略]";
  return text
    .replace(/\bBearer\s+[A-Za-z0-9._~+\/-]+=*/gi, "Bearer [REDACTED]")
    .replace(/([?&](?:grant|token)=)[^\s&#]+/gi, "$1[REDACTED]")
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "[REDACTED]")
    .replace(/sbp_(?:oauth_)?[a-f0-9]{40}/g, "[REDACTED]");
}

export function playwrightEnvironment(env, users) {
  const allowed = ["PATH", "HOME", "TMPDIR", "TMP", "TEMP", "LANG", "LC_ALL", "SYSTEMROOT", "DISPLAY", "XAUTHORITY", "HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "NO_PROXY", "http_proxy", "https_proxy", "all_proxy", "no_proxy", "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"];
  const safe = Object.fromEntries(allowed.filter(key => env[key] !== undefined).map(key => [key, env[key]]));
  return { ...safe, ATOMS_E2E_SKIP_LOCAL_ENV: "1", ATOMS_E2E_BASE_URL: ORIGIN, E2E_REAL_MODEL: "1", HEADLESS: "true",
    E2E_PRIMARY_EMAIL: users[0].email, E2E_PRIMARY_PASSWORD: users[0].password,
    E2E_OTHER_EMAIL: users[1].email, E2E_OTHER_PASSWORD: users[1].password };
}

function checked(result) {
  if (result.error) throw new Error("临时生产测试数据操作失败");
  return result.data;
}

export async function withTemporaryProductionUsers({ admin, onCleanup = () => {} }, operation) {
  const users = [];
  let originalError;
  try {
    for (let number = 0; number < 2; number++) {
      const email = `atoms-production-${randomUUID()}@example.invalid`, password = randomUUID();
      const data = checked(await admin.auth.admin.createUser({ email, password, email_confirm: true }));
      if (!data?.user || !uuid.test(data.user.id)) throw new Error("临时账号创建未返回UUID");
      users.push({ id: data.user.id, email, password, projectIds: [] });
    }
    return await operation(users);
  } catch (error) { originalError = error; throw error; }
  finally {
    let failures = 0;
    const manifest = [];
    for (const user of users) {
      const step = (name, operation) => async (...args) => {
        try { return await operation(...args); }
        catch (error) {
          manifest.push({ ownerId: user.id, ...(args[0] ? { projectId: args[0] } : { projectIds: [...user.projectIds] }), step: name });
          throw error;
        }
      };
      failures += (await cleanupCloudFixture({
        listProjects: step("listProjects", async () => {
          const ids = checked(await admin.from("projects").select("id").eq("owner_id", user.id)).map(project => project.id);
          user.projectIds = [...new Set([...user.projectIds, ...ids])];
          return ids;
        }),
        removeArtifacts: step("removeArtifacts", async projectId => {
          if (!uuid.test(projectId)) throw new Error("清理项目UUID无效");
          const prefix = `${user.id}/${projectId}`;
          const storage = admin.storage.from("atoms-artifacts");
          // 每轮删完再列：只处理当前临时用户/项目的对象，不做全bucket扫描。
          while (true) {
            const files = checked(await storage.list(prefix, { limit: 1000 }));
            if (!files.length) break;
            checked(await storage.remove(files.map(file => `${prefix}/${file.name}`)));
          }
        }),
        removeProject: step("removeProject", async projectId => {
          if (!uuid.test(projectId)) throw new Error("清理项目UUID无效");
          checked(await admin.from("projects").delete().eq("id", projectId).eq("owner_id", user.id));
        }),
        removeAccount: step("removeAccount", async () => { checked(await admin.auth.admin.deleteUser(user.id)); }),
      }, user.projectIds)).length;
    }
    try { onCleanup(failures, manifest); } catch { /* 汇总日志不得替换原始任务错误。 */ }
    if (failures && !originalError) throw new Error(`生产测试清理失败 ${failures} 项`);
  }
}

export function runPlaywrightChild(args, env, execute = spawnSync) {
  const child = execute(process.execPath, [fileURLToPath(new URL("../../node_modules/@playwright/test/cli.js", import.meta.url)), "test", ...args, "--reporter=json"], {
    cwd: fileURLToPath(new URL("../../", import.meta.url)), env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64 * 1024 * 1024, timeout: 30 * 60 * 1000, killSignal: "SIGKILL",
  });
  if (child.error || child.status === null) throw new Error("Playwright子进程异常退出或达到30分钟截止");
  let summary = {};
  try {
    const report = JSON.parse(child.stdout), stats = report.stats;
    const errors = [...(report.errors ?? [])];
    const visit = suite => { for (const spec of suite.specs ?? []) for (const test of spec.tests ?? []) for (const result of test.results ?? []) errors.push(...(result.errors ?? [])); for (const nested of suite.suites ?? []) visit(nested); };
    for (const suite of report.suites ?? []) visit(suite);
    summary = { passed: stats.expected, failed: stats.unexpected, skipped: stats.skipped, flaky: stats.flaky };
    if (child.status) {
      const redact = text => { for (const key of ["E2E_PRIMARY_PASSWORD", "E2E_OTHER_PASSWORD", "E2E_PRIMARY_EMAIL", "E2E_OTHER_EMAIL"]) if (env[key]) text = text.replaceAll(env[key], "[REDACTED]"); return redactProductionDiagnostic(text).slice(0, 1200); };
      summary.failureSummary = errors.slice(-3).map(error => redact(String(error.message ?? "测试失败")));
      summary.reportPath = "test-results";
    }
  } catch { /* 启动失败可能无JSON；不打印CLI原始stdout/stderr。 */ }
  return { mode: "playwright", playwrightExitCode: child.status, ...summary };
}

export async function probeAnonymousPreview(previewUrl, projectId, request = fetch) {
  let status = null;
  const failure = reason => ({ previewHttpStatus: status, fixtureRendered: false, previewFailure: reason });
  if (!previewUrl) return failure("preview_link_unavailable");
  let url;
  try { url = new URL(previewUrl); } catch { return failure("invalid_preview_url"); }
  const path = `/api/preview/${projectId}`;
  const valid = value => uuid.test(projectId) && value.origin === `https://atoms-app-${projectId}.vercel.app` &&
    !value.username && !value.password && !value.hash && [path, `${path}/`].includes(value.pathname);
  if (!valid(url)) return failure("invalid_preview_url");
  try {
    for (let hop = 0; hop < 2; hop++) {
      // Anonymous transport only: never reuse the production resume Cookie/Auth headers.
      const response = await request(url.toString(), { method: "GET", redirect: "manual", credentials: "omit", signal: AbortSignal.timeout(10000) });
      status = response.status;
      if (status >= 300 && status < 400) {
        await response.body?.cancel().catch(() => {});
        if (status !== 308 || hop) return failure("redirect_blocked");
        const location = response.headers.get("location");
        if (!location) return failure("redirect_blocked");
        const canonical = new URL(location, url);
        if (!valid(canonical) || canonical.search !== url.search || canonical.pathname === url.pathname) return failure("redirect_blocked");
        url = canonical;
        continue;
      }
      if (status !== 200) { await response.body?.cancel().catch(() => {}); return failure("preview_http_error"); }
      if (!/text\/html/i.test(response.headers.get("content-type") ?? "")) { await response.body?.cancel().catch(() => {}); return failure("preview_not_html"); }
      const body = await response.text();
      if (!body.includes("Diagnostic fixture, not AI output")) return failure("diagnostic_fixture_missing");
      return { previewHttpStatus: status, fixtureRendered: true };
    }
  } catch { return failure("preview_fetch_failed"); }
}

async function diagnosticProbe(user, url, publishableKey, request) {
  const cookies = new Map();
  const client = createServerClient(url, publishableKey, { global: { fetch: request }, cookies: {
    getAll: () => [...cookies].map(([name, value]) => ({ name, value })),
    setAll: values => { for (const { name, value } of values) cookies.set(name, value); },
  } });
  checked(await client.auth.signInWithPassword({ email: user.email, password: user.password }));
  const projectId = randomUUID(), runId = randomUUID(); user.projectIds.push(projectId);
  checked(await client.from("projects").insert({ id: projectId, owner_id: user.id, name: "生产诊断fixture（非AI生成）" }));
  await withProjectLease(client, projectId, async lease => {
    const artifactPath = await uploadArtifact(client, projectId, runId, { files: [{ path: "index.html", content: Buffer.from("<!doctype html><main>Diagnostic fixture, not AI output</main>").toString("base64"), contentType: "text/html" }] });
    const at = new Date().toISOString();
    await saveCloudProjectSnapshot(client, lease, { projectId, expectedVersion: 0, projectName: "生产诊断fixture（非AI生成）", summary: "仅诊断已保存版本的生产resume；不调用模型或VM", messages: [],
      files: [{ path: "src/App.tsx", content: "export default function App(){return <main>Diagnostic fixture</main>}" }, { path: "src/styles.css", content: "body{margin:0}" }],
      run: { id: runId, mode: "create", requirement: "诊断fixture，非AI验收", status: "completed", model: "diagnostic", events: [{ event: "complete", at, data: { projectId, version: 1, artifactPath, previewReady: false } }], startedAt: at, completedAt: at, buildAttempts: 0 } });
  });
  const response = await request(`${ORIGIN}/api/projects/${projectId}/resume`, { method: "POST", redirect: "error", headers: { Origin: ORIGIN, Cookie: [...cookies].map(([name, value]) => `${name}=${value}`).join("; ") } });
  const data = await response.json();
  const preview = await probeAnonymousPreview(data.previewUrl, projectId, request);
  return { mode: "diagnostic", resumeStatus: response.status, version: data.currentVersion ?? null, previewReady: data.previewReady ?? false,
    previewError: redactProductionDiagnostic(data.previewError ?? data.error ?? ""), ...preview };
}

async function main(args) {
  if (!args.length || (args.includes("--probe") && args.length !== 1)) throw new Error("传入 --probe 或 Playwright spec/grep 参数");
  if (readFileSync(new URL("../../supabase/.temp/project-ref", import.meta.url), "utf8").trim() !== REF) throw new Error("拒绝操作其他Supabase项目");
  const envPath = fileURLToPath(new URL("../../.env.local", import.meta.url));
  if (existsSync(envPath)) process.loadEnvFile(envPath);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (url !== `https://${REF}.supabase.co` || !key) throw new Error("Atoms专用Supabase配置无效");
  const keys = spawnSync("supabase", ["projects", "api-keys", "--project-ref", REF, "-o", "json"], { encoding: "utf8", timeout: 30000, stdio: ["ignore", "pipe", "pipe"] });
  if (keys.status !== 0) throw new Error("Supabase管理凭据获取失败（不输出CLI原始内容）");
  let serviceKey;
  try { serviceKey = JSON.parse(keys.stdout).find(item => item.name === "service_role")?.api_key; }
  catch { throw new Error("Supabase凭据响应无效（不输出CLI原始内容）"); }
  if (!serviceKey) throw new Error("缺少临时账号管理凭据");
  const request = (input, init) => fetch(input, { ...init, signal: init?.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(20000)]) : AbortSignal.timeout(20000) });
  const options = { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: request } };
  let cleanupFailures = 0, cleanupManifest = [];
  try {
    const result = await withTemporaryProductionUsers({ admin: createClient(url, serviceKey, options), onCleanup: (count, manifest) => { cleanupFailures = count; cleanupManifest = manifest; } }, async users => {
      if (args[0] === "--probe") return diagnosticProbe(users[0], url, key, request);
      return runPlaywrightChild(args, playwrightEnvironment(process.env, users));
    });
    console.log(JSON.stringify({ ...result, temporaryUsers: 2, cleanupFailures }));
    process.exitCode = result.playwrightExitCode ?? 0;
  } finally { if (cleanupFailures) console.error(JSON.stringify({ cleanupFailures, cleanupManifest })); }
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  main(process.argv.slice(2)).catch(error => { console.error(redactProductionDiagnostic(error.message)); process.exitCode = 1; });
}
