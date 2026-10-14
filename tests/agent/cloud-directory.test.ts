import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { prepareProjectDirectory } from "../../lib/agent/files.ts";

test("云创建只写入任务临时根目录，不依赖部署源码目录可写", async () => {
  const root = await mkdtemp(join(tmpdir(), "atoms-cloud-directory-"));
  const id = "623e4567-e89b-42d3-a456-426614174020";
  try {
    const directory = await prepareProjectDirectory(id, "测试", {
      projectName: "测试", summary: "测试临时工作目录",
      files: [{ path: "src/App.tsx", content: "export default function App(){return <main>测试</main>}" }, { path: "src/styles.css", content: "body{margin:0}" }],
    }, root);
    assert.equal(directory, join(root, id));
    assert.match(await readFile(join(directory, "src/App.tsx"), "utf8"), /测试/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
