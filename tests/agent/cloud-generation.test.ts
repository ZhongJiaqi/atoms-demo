import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { mock } from "node:test";

const project = { projectName: "测试", summary: "云产物", files: [{ path: "src/App.tsx", content: "export default function App(){return <main>测试</main>}" }, { path: "src/styles.css", content: "body{margin:0}" }] };
const built = { success: true, exitCode: 0, signal: null, stdout: "", stderr: "", timedOut: false, resourceExceeded: false, durationMs: 1 };
let delayedGeneration: (() => Promise<{project: typeof project; model: string}>) | undefined;
mock.module("../../lib/agent/model.ts", { namedExports: {
  generateProject: async () => delayedGeneration ? delayedGeneration() : ({ project, model: "test-boundary" }),
  modifyProject: async () => ({ patch: { summary: "修改云产物", files: [{path:"src/styles.css", content:"body{margin:1px}"}], deletedFiles:[] }, model: "test-boundary" }),
  repairProject: async () => { throw Error("unexpected repair"); }, repairProjectPatch: async () => { throw Error("unexpected repair"); },
} });
mock.module("../../lib/sandbox/local-sandbox.ts", { namedExports: {
  buildProject: async () => built, startPreview: async () => {}, getProjectRuntimeDirectory: () => null,
} });
const { runGeneration } = await import("../../lib/agent/run-generation.ts");

let cloudDirectory = "";
mock.module("../../lib/sandbox/vercel-build.ts", { namedExports: { buildInVercelSandbox: async (directory: string) => {
  cloudDirectory = directory;
  await mkdir(join(directory, "dist"), { recursive: true });
  await writeFile(join(directory, "dist/index.html"), "<!doctype html><main>测试</main>");
  return built;
} } });

test("云complete在产物与源码保存成功后发送，且不伪造预览地址", async () => {
  const root = await mkdtemp(join(tmpdir(), "atoms-cloud-flow-"));
  const events: { event: string; data: Record<string, unknown> }[] = [];
  let saved = false;
  try {
    await runGeneration("测试生成", "https://app.example", event => {
      if (event.event === "complete") assert.equal(saved, true);
      events.push(event);
    }, {
      createDraft: async () => {},
      saveVersion: async (_state, _project, turn) => {
        assert.equal(turn.events.at(-1)?.data.artifactPath, "private/artifact.json");
        saved = true;
        return 1;
      },
    }, undefined, {
      projectId: "123e4567-e89b-42d3-a456-426614174011", root,
      build: async () => built,
      publish: async () => ({ artifactPath: "private/artifact.json", previewReady: false }),
      load: async () => { throw Error("creation must not load"); },
    });
    assert.equal(events.at(-1)?.data.previewReady, false);
    assert.equal(events.at(-1)?.data.previewUrl, undefined);
    assert.equal(events.at(-1)?.data.artifactPath, "private/artifact.json");
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("云入口硬截止后迟到模型不能上传、提交版本或发送完成及修复事件", async t => {
  const { runCloudGeneration } = await import("../../lib/agent/run-cloud-generation.ts");
  let finishModel!: (result: {project: typeof project; model: string}) => void;
  delayedGeneration = () => new Promise(resolve => {finishModel = resolve;});
  let modelStarted!: () => void;
  const started = new Promise<void>(resolve => {modelStarted = resolve;});
  const calls: string[] = [];
  const events: string[] = [];
  const client = {
    auth: {getUser: async () => ({data:{user:{id:"123e4567-e89b-42d3-a456-426614174012"}},error:null})},
    from: () => ({insert: async () => ({error:null})}),
    rpc: async (name: string) => {calls.push(name);return {data:true,error:null};},
    storage: {from: () => ({upload: async () => {calls.push("upload");return {error:null};}})},
  };
  t.mock.timers.enable({apis:["setTimeout"]});
  try {
    const task = runCloudGeneration("超时测试", "https://app.example", event => {
      events.push(event.event);
      if (event.event === "model_started") modelStarted();
    }, client as unknown as Parameters<typeof runCloudGeneration>[3]);
    const rejection = assert.rejects(task, /任务超时/);
    await started;
    t.mock.timers.tick(240000);
    await rejection;
    finishModel({project, model:"late-model"});
    await new Promise<void>(resolve => setImmediate(resolve));
    assert.deepEqual(calls, ["acquire_project_lease", "release_project_lease"]);
    assert.equal(events.includes("complete"), false);
    assert.equal(events.includes("repair_started"), false);
    assert.equal(events.includes("model_completed"), false);
  } finally { delayedGeneration = undefined; t.mock.timers.reset(); }
});

test("云入口在同项目租约内上传并fenced保存，结束清理临时源码目录", async () => {
  const module = await import("../../lib/agent/run-cloud-generation.ts");
  assert.equal(typeof module.runCloudGeneration, "function", "缺少云Agent入口");
  const calls: string[] = [];
  let artifact = "";
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: "123e4567-e89b-42d3-a456-426614174012" } }, error: null }) },
    from: () => ({ insert: async () => { calls.push("draft"); return { error: null }; } }),
    rpc: async (name: string, args: Record<string, unknown>) => {
      calls.push(name);
      if (name === "save_cloud_project_version") {
        assert.equal(args.p_expected_version, 0);
        assert.equal(typeof args.p_lease_token, "string");
        const run = args.p_run as { events: { data: Record<string, unknown> }[] };
        assert.equal(run.events.at(-1)?.data.artifactPath, artifact);
        return { data: 1, error: null };
      }
      return { data: true, error: null };
    },
    storage: { from: () => ({ upload: async (path: string, data: Blob) => {
      calls.push("upload"); artifact = path;
      assert.match(await data.text(), /index.html/);
      return { error: null };
    } }) },
  };
  const events: { event: string; data: Record<string, unknown> }[] = [];
  await module.runCloudGeneration("测试云生成", "https://app.example", (event: typeof events[number]) => events.push(event), client as unknown as Parameters<typeof module.runCloudGeneration>[3]);
  assert.deepEqual(calls, ["draft", "acquire_project_lease", "upload", "save_cloud_project_version", "release_project_lease"]);
  assert.equal(events.at(-1)?.event, "complete");
  assert.equal(events.at(-1)?.data.artifactPath, artifact);
  assert.equal(events.at(-1)?.data.previewUrl, undefined);
  assert.match(cloudDirectory, /atoms-cloud-task-/);
  await assert.rejects(readFile(join(cloudDirectory, "src/App.tsx")), { code: "ENOENT" });
});

test("跨实例修改从数据库恢复原项目与版本，保存失败不发送complete", async () => {
  const { runCloudGeneration } = await import("../../lib/agent/run-cloud-generation.ts");
  const id = "123e4567-e89b-42d3-a456-426614174021";
  const database = {
    projects: { id, name: "数据库原项目", summary: "数据库基线", current_version: 4, created_at: "2026-10-14T00:00:00Z", updated_at: "2026-10-14T00:00:00Z" },
    messages: [], project_files: project.files, agent_runs: [],
  };
  let saving = false;
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: "123e4567-e89b-42d3-a456-426614174012" } }, error: null }) },
    from: (table: keyof typeof database) => {
      const query = { select: () => query, eq: () => query, single: async () => ({data: database[table], error: null}), order: async () => ({data: database[table], error: null}) };
      return query;
    },
    rpc: async (name: string, args: Record<string, unknown>) => {
      if (name === "save_cloud_project_version") {
        saving = true;
        assert.equal(args.p_project_id, id);
        assert.equal(args.p_expected_version, 4);
        assert.equal(args.p_project_name, "数据库原项目");
        assert.equal((args.p_files as typeof project.files).find(file => file.path === "src/styles.css")?.content, "body{margin:1px}");
        return { data: null, error: {message:"lease lost"} };
      }
      return { data: true, error: null };
    },
    storage: { from: () => ({upload: async () => ({error:null})}) },
  };
  const events: string[] = [];
  await assert.rejects(runCloudGeneration("修改样式", "https://app.example", event => events.push(event.event), client as unknown as Parameters<typeof runCloudGeneration>[3], id), /lease lost/);
  assert.equal(saving, true);
  assert.equal(events.includes("complete"), false);
  assert.equal(events.includes("project_loaded"), true);
  await assert.rejects(readFile(join(cloudDirectory, "src/App.tsx")), {code:"ENOENT"});
});
