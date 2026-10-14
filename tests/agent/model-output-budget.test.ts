import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { generateProject, modifyProject, repairProject, repairProjectPatch } from "../../lib/agent/model.ts";
import { mergeProjectPatch } from "../../lib/agent/files.ts";

const project = { projectName: "测试项目", summary: "请求边界样本，非AI生成", files: [
  { path: "src/App.tsx", content: "export default function App(){return <h1>测试</h1>}" },
  { path: "src/styles.css", content: "body{margin:0}" },
] };
const patch = { summary: "保留原功能的修改", files: [{ path: "src/App.tsx", content: `${project.files[0].content}\n/* ${"x ".repeat(12_000)} */` }], deletedFiles: [] };

// Only the HTTP provider boundary is controlled; this is not evidence of AI quality.
async function provider(operation: (requests: Array<{ max_tokens: number }>) => Promise<void>, mode: "project" | "patch" | "length") {
  const requests: Array<{ max_tokens: number }> = [];
  const server = createServer(async (req, res) => {
    let body = "";
    for await (const chunk of req) body += chunk;
    const request = JSON.parse(body);
    requests.push(request);
    // Simulate a valid large patch that cannot fit in the old 8k allowance.
    const truncated = mode === "length" || (mode === "patch" && request.max_tokens < 10_000);
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ id: "test-boundary", object: "chat.completion", created: 0, model: "deepseek-v4.1-flash",
      choices: [{ index: 0, finish_reason: truncated ? "length" : "stop", message: { role: "assistant", content: truncated ? '{"summary":"未完成' : JSON.stringify(mode === "project" ? project : patch) } }],
    }));
  });
  const names = ["LLM_API_KEY", "LLM_BASE_URL", "LLM_MODEL"] as const;
  const original = names.map(name => process.env[name]);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw Error("测试HTTP服务未启动");
  process.env.LLM_API_KEY = "not-a-real-key";
  process.env.LLM_BASE_URL = `http://127.0.0.1:${address.port}/v1`;
  process.env.LLM_MODEL = "deepseek-v4.1-flash";
  try { await operation(requests); }
  finally {
    names.forEach((name, index) => { if (original[index] === undefined) delete process.env[name]; else process.env[name] = original[index]; });
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
}

test("首次生成与首次生成的构建修复仍发送8k输出预算", async () => {
  await provider(async requests => {
    assert.deepEqual((await generateProject("创建测试应用")).project, project);
    assert.deepEqual((await repairProject("创建测试应用", project, "测试构建日志", 1)).project, project);
    assert.deepEqual(requests.map(request => request.max_tokens), [8000, 8000]);
  }, "project");
});

test("增量修改与增量构建修复可返回超过旧预算的完整文件，预算为16k", async () => {
  await provider(async requests => {
    assert.equal(mergeProjectPatch(project, patch).project.files.length, 2);
    assert.deepEqual((await modifyProject("增加任务优先级", project, ["创建测试应用"])).patch, patch);
    assert.deepEqual((await repairProjectPatch("增加任务优先级", project, "测试构建日志", 1)).patch, patch);
    assert.deepEqual(requests.map(request => request.max_tokens), [16000, 16000]);
  }, "patch");
});

test("提高预算后截断仍必须报错，JSON最多尝试两次，不能返回假成功", async () => {
  await provider(async requests => {
    await assert.rejects(modifyProject("增加任务优先级", project, []), /连续两次.*长度上限/);
    assert.deepEqual(requests.map(request => request.max_tokens), [16000, 16000]);
  }, "length");
});
