import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import test, { type TestContext } from "node:test";
import { Sandbox } from "@vercel/sandbox";
import { buildInVercelSandbox } from "../../lib/sandbox/vercel-build.ts";

// Only the external SDK transport is replaced; source validation and dist writes run on real files.
async function fixture(t: TestContext, options: { fail?: string; manifest?: unknown; oversized?: boolean; noisy?: boolean; realCollector?: boolean } = {}) {
  const root = await realpath(await mkdtemp(join(tmpdir(), "atoms-cloud-build-")));
  await mkdir(join(root, "src"));
  await writeFile(join(root, "src/App.tsx"), "export default function App(){return <main>测试</main>}");
  await writeFile(join(root, "src/styles.css"), "body{margin:0}");
  await writeFile(join(root, "package.json"), '{"scripts":{"postinstall":"steal-secret"}}');
  await writeFile(join(root, ".env.local"), "LLM_API_KEY=never-upload-this");
  const events: string[] = [];
  const uploads = new Map<string, string>();
  const commands: Record<string, unknown>[] = [];
  const reads: string[] = [];
  let config: Record<string, unknown> = {};
  const remote = {
    writeFiles: async (files: { path: string; content: Buffer }[]) => {
      events.push(files.some(f => f.path.endsWith("App.tsx")) ? "source" : "trusted");
      for (const file of files) uploads.set(file.path, file.content.toString());
    },
    update: async (value: unknown) => { assert.deepEqual(value, { networkPolicy: "deny-all" }); events.push("deny"); },
    runCommand: async (command: Record<string, unknown>) => {
      commands.push(command);
      const phase = command.cmd === "npm" ? "install" : (command.args as string[])[0].includes("tsc") ? "typecheck" : (command.args as string[])[0].includes("vite") ? "build" : "collect";
      events.push(phase);
      if (options.fail === "timeout" && phase === "build") throw Object.assign(new Error("command timeout"), { name: "TimeoutError" });
      const stdout = phase === "collect" ? options.realCollector
        ? execFileSync(process.execPath, ["-e", (command.args as string[])[1].replace("'/vercel/sandbox/dist'", JSON.stringify(join(root, "vm-dist")))], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] })
        : JSON.stringify(options.manifest ?? [{ path: "index.html", size: 5 }, { path: "assets/app.js", size: 2 }]) : options.noisy ? "x".repeat(70_000) : `${phase}日志\n`;
      const stderr = options.fail === phase ? "真实构建错误" : "";
      (command.stdout as { write(value: string): void } | undefined)?.write(stdout);
      (command.stderr as { write(value: string): void } | undefined)?.write(stderr);
      return { exitCode: options.fail === phase ? 1 : 0, stdout: async () => stdout, stderr: async () => stderr,
        logs: async function* () { yield { stream: "stdout", data: stdout }; yield { stream: "stderr", data: stderr }; },
        wait: async () => ({ exitCode: options.fail === phase ? 1 : 0, durationMs: 1 }),
      };
    },
    readFile: async ({ path }: { path: string }) => { reads.push(path); return Readable.from([options.oversized ? Buffer.alloc(2 * 1024 * 1024 + 1) : Buffer.from(path.endsWith("index.html") ? "hello" : "js")]); },
    stop: async () => { events.push("stop"); if (options.fail === "stop") throw new Error("停止失败"); },
  };
  t.mock.method(Sandbox, "create", async (value: Record<string, unknown>) => { config = value; events.push("create"); return remote; });
  t.after(async () => { t.mock.restoreAll(); await rm(root, { recursive: true, force: true }); });
  return { root, events, uploads, commands, reads, get config() { return config; } };
}

test("固定依赖先安装，生成源码仅在断网后构建，产物写回且停止VM", async t => {
  const f = await fixture(t);
  const result = await buildInVercelSandbox(f.root);
  assert.equal(result.success, true);
  assert.deepEqual(f.events, ["create", "trusted", "install", "deny", "source", "typecheck", "build", "collect", "stop"]);
  assert.equal(f.config.persistent, false);
  assert.deepEqual(f.config.resources, { vcpus: 1 });
  assert.ok(Number(f.config.timeout) > 0 && Number(f.config.timeout) <= 180_000);
  assert.deepEqual(f.config.networkPolicy, { allow: ["registry.npmjs.org"] });
  assert.equal(f.config.env, undefined);
  assert.equal(f.config.ports, undefined);
  assert.ok(![...f.uploads.values()].join().includes("steal-secret"));
  assert.ok(![...f.uploads.values()].join().includes("never-upload-this"));
  assert.deepEqual(JSON.parse(f.uploads.get("/vercel/sandbox/package.json")!).dependencies, {
    react: "19.1.0", "react-dom": "19.1.0", "@vitejs/plugin-react": "4.4.1", vite: "6.3.5",
    "@types/react": "19.1.0", "@types/react-dom": "19.1.0", typescript: "5.8.3",
  });
  assert.deepEqual(f.commands[0].args, ["install", "--ignore-scripts", "--no-audit", "--no-fund", "--registry=https://registry.npmjs.org"]);
  for (const c of f.commands) { assert.equal(c.cwd, "/vercel/sandbox"); assert.ok(Number(c.timeoutMs) > 0); assert.equal(c.env, undefined); }
  assert.equal(await readFile(join(f.root, "dist/index.html"), "utf8"), "hello");
  assert.equal(await readFile(join(f.root, "dist/assets/app.js"), "utf8"), "js");
  assert.match(result.stdout, /typecheck日志/);
  assert.match(result.stdout, /build日志/);
});

for (const phase of ["install", "typecheck", "build", "timeout"]) {
  test(`${phase}失败返回真实状态和日志并停止VM`, async t => {
    const f = await fixture(t, { fail: phase });
    const result = await buildInVercelSandbox(f.root);
    assert.equal(result.success, false);
    assert.equal(result.timedOut, phase === "timeout");
    assert.match(result.stderr, phase === "timeout" ? /超时/ : /真实构建错误/);
    assert.equal(f.events.at(-1), "stop");
    assert.ok(!f.events.includes("collect"));
    await assert.rejects(readFile(join(f.root, "dist/index.html")), { code: "ENOENT" });
  });
}

test("拒绝源码软链接且不会创建VM", async t => {
  const f = await fixture(t);
  await symlink(join(f.root, "package.json"), join(f.root, "src/types.ts"));
  const result = await buildInVercelSandbox(f.root);
  assert.equal(result.success, false);
  assert.match(result.stderr, /软链接/);
  assert.deepEqual(f.events, []);
});

for (const manifest of [[{ path: "../escape", size: 2 }], [{ path: "/tmp/escape", size: 2 }], [{ path: "index.html", size: 21_000_000 }], Array.from({ length: 257 }, (_, n) => ({ path: `f${n}`, size: 0 }))]) {
  test("拒绝产物越界或超过文件数/字节限制", async t => {
    const f = await fixture(t, { manifest });
    const result = await buildInVercelSandbox(f.root);
    assert.equal(result.success, false);
    assert.match(result.stderr, /产物/);
    assert.equal(f.events.at(-1), "stop");
    await assert.rejects(readFile(join(f.root, "dist/index.html")), { code: "ENOENT" });
  });
}

test("读取产物流实际超限也拒绝，不能只相信远端声明大小", async t => {
  const f = await fixture(t, { oversized: true });
  const result = await buildInVercelSandbox(f.root);
  assert.equal(result.success, false);
  assert.match(result.stderr, /产物/);
  assert.equal(f.events.at(-1), "stop");
});

test("使用 detached 日志迭代避免SDK内部累积所有日志，并限制返回日志大小", async t => {
  const f = await fixture(t, { noisy: true });
  const result = await buildInVercelSandbox(f.root);
  assert.equal(result.success, true);
  assert.ok(Buffer.byteLength(result.stdout) <= 64 * 1024);
  for (const command of f.commands) assert.equal(command.detached, true);
});

test("沙盒停止失败不能返回静默成功", async t => {
  const f = await fixture(t, { fail: "stop" });
  const result = await buildInVercelSandbox(f.root);
  assert.equal(result.success, false);
  assert.match(result.stderr, /停止失败/);
});

test("源文件超限在启动云端前拒绝", async t => {
  const f = await fixture(t);
  await writeFile(join(f.root, "src/App.tsx"), "x".repeat(36_001));
  const result = await buildInVercelSandbox(f.root);
  assert.equal(result.success, false);
  assert.match(result.stderr, /源码.*超限/);
  assert.deepEqual(f.events, []);
});

test("现有dist软链接不会被跟随或覆盖", async t => {
  const f = await fixture(t);
  await mkdir(join(f.root, "outside"));
  await writeFile(join(f.root, "outside/index.html"), "keep");
  await symlink(join(f.root, "outside"), join(f.root, "dist"));
  const result = await buildInVercelSandbox(f.root);
  assert.equal(result.success, false);
  assert.match(result.stderr, /产物目标目录/);
  assert.equal(await readFile(join(f.root, "outside/index.html"), "utf8"), "keep");
  assert.equal(f.events.at(-1), "stop");
});

test("实际运行可信产物收集脚本，拒绝远端dist中的软链接", async t => {
  const f = await fixture(t, { realCollector: true });
  await mkdir(join(f.root, "vm-dist"));
  await symlink(join(f.root, ".env.local"), join(f.root, "vm-dist/index.html"));
  const result = await buildInVercelSandbox(f.root);
  assert.equal(result.success, false);
  assert.match(result.stderr, /产物含软链接/);
  assert.equal(f.events.at(-1), "stop");
});

test("实际运行可信产物收集脚本并写回完整嵌套产物", async t => {
  const f = await fixture(t, { realCollector: true });
  await mkdir(join(f.root, "vm-dist/assets"), { recursive: true });
  await writeFile(join(f.root, "vm-dist/index.html"), "hello");
  await writeFile(join(f.root, "vm-dist/assets/app.js"), "js");
  const result = await buildInVercelSandbox(f.root);
  assert.equal(result.success, true);
  assert.equal(await readFile(join(f.root, "dist/assets/app.js"), "utf8"), "js");
});

for (const manifest of [
  [{ path: "index.html", size: 2 * 1024 * 1024 + 1 }],
  [{ path: "index.html", size: 2 * 1024 * 1024 }, { path: "app.js", size: 2 * 1024 * 1024 }],
]) {
  test("产物单文件2MiB、总量3MiB上限在下载前执行", async t => {
    const f = await fixture(t, { manifest });
    const result = await buildInVercelSandbox(f.root);
    assert.equal(result.success, false);
    assert.deepEqual(f.reads, []);
    assert.match(result.stderr, /产物路径或大小无效/);
  });
}
