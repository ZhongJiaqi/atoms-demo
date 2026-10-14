import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { Readable } from "node:stream";
import { Sandbox } from "@vercel/sandbox";

const artifact = { files: [{ path: "index.html", contentType: "text/html", content: Buffer.from('<!doctype html><div id="root">封面边界测试</div>').toString("base64") }] };
// 仅SDK传输契约的PNG头样本，不冒充真实浏览器截图。
const png = Buffer.alloc(33);
Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(png);
png.writeUInt32BE(13, 8); png.write("IHDR", 12); png.writeUInt32BE(960, 16); png.writeUInt32BE(600, 20);

async function subject() {
  const module = await import("../../lib/cloud/capture-thumbnail.ts").catch(() => null);
  assert.ok(module, "缺少真实云端封面截图运行器");
  return module.captureCloudThumbnail;
}

function transport(t: TestContext, options: { fail?: string; bytes?: Buffer } = {}) {
  const events: string[] = [], configs: Record<string, unknown>[] = [], commands: Record<string, unknown>[] = [];
  const remote = {
    writeFiles: async (files: Array<{ path: string; content: Buffer }>) => {
      events.push(files.some(file => file.path.endsWith("page.html")) ? "page" : "trusted");
    },
    update: async (value: unknown) => { assert.deepEqual(value, { networkPolicy: "deny-all" }); events.push("deny"); },
    runCommand: async (value: Record<string, unknown>) => {
      commands.push(value);
      const phase = value.cmd === "npm" ? "install" : (value.args as string[]).includes("install") ? "browser" : "capture";
      events.push(phase);
      if (options.fail === phase) throw Error("private transport failure must not escape");
      return { logs: async function* () { yield { stream: "stdout", data: "trusted setup log" }; }, wait: async () => ({ exitCode: 0 }) };
    },
    readFile: async () => { events.push("read"); return Readable.from([options.bytes ?? png]); },
    stop: async () => { events.push("stop"); if (options.fail === "stop") throw Error("private stop failure"); },
  };
  t.mock.method(Sandbox, "create", async (config: Record<string, unknown>) => { configs.push(config); events.push("create"); return remote; });
  t.after(() => t.mock.restoreAll());
  return { events, configs, commands };
}

test("可信浏览器安装结束并断网后才写应用HTML，取回有界PNG并停止VM", async t => {
  const f = transport(t), capture = await subject();
  assert.deepEqual(await capture(artifact), png);
  assert.deepEqual(f.events, ["create", "trusted", "install", "browser", "deny", "page", "capture", "read", "stop"]);
  assert.equal(f.configs[0].persistent, false);
  assert.deepEqual(f.configs[0].resources, { vcpus: 1 });
  assert.ok(Number(f.configs[0].timeout) <= 120_000);
  assert.equal(f.configs[0].env, undefined); assert.equal(f.configs[0].ports, undefined);
  assert.ok((f.commands[0].args as string[]).includes("--ignore-scripts"));
  for (const c of f.commands) {
    assert.equal(c.detached, true);
    assert.ok(Number(c.timeoutMs) > 0 && Number(c.timeoutMs) <= 120_000);
    assert.equal(JSON.stringify(c).includes("VERCEL_TOKEN"), false);
  }
});

for (const fail of ["install", "browser", "capture", "stop"]) {
  test(`${fail}失败不得返回假封面，仍清理VM且不暴露传输详情`, async t => {
    const f = transport(t, { fail }), capture = await subject();
    await assert.rejects(capture(artifact), error => {
      assert.doesNotMatch(String(error), /private transport|private stop/);
      return true;
    });
    assert.equal(f.events.at(-1), "stop");
  });
}

test("输入无效、输出非PNG或超过1MiB均拒绝，输入校验在创建沙盒之前", async t => {
  const f = transport(t, { bytes: Buffer.alloc(1024 * 1024 + 1) }), capture = await subject();
  await assert.rejects(capture({ files: [] }));
  assert.equal(f.configs.length, 0);
  await assert.rejects(capture(artifact), /超限|PNG/);
  assert.equal(f.events.at(-1), "stop");
});

test("调用方剩余预算限制VM和所有命令，非法预算在联网之前拒绝", async t => {
  const f = transport(t), capture = await subject();
  for (const timeoutMs of [0, 999, 120_001, NaN]) await assert.rejects(capture(artifact, { timeoutMs }), /预算/);
  assert.equal(f.configs.length, 0);
  await capture(artifact, { timeoutMs: 5000 });
  assert.equal(f.configs[0].timeout, 5000);
  assert.ok(f.commands.every(command => Number(command.timeoutMs) <= 5000));
});
