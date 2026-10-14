import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, readFile, readdir, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildInVercelSandbox } from "../../lib/sandbox/vercel-build.ts";

test("真实云沙盒构建 React/Vite 并取回静态产物", { skip: process.env.ATOMS_REAL_CLOUD !== "1", timeout: 200000 }, async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "atoms-cloud-smoke-")));
  try {
    await mkdir(join(root, "src"));
    // 明确测试源码，不冒充模型生成。此用例仅验证真实云构建/下载，不代表Agent端到端。
    await writeFile(join(root, "src/App.tsx"), 'import {useState} from "react";export default function App(){const [n,setN]=useState(0);return <button onClick={()=>setN(n+1)}>Cloud {n}</button>}');
    await writeFile(join(root, "src/styles.css"), "body{font-family:system-ui}");
    const result = await buildInVercelSandbox(root);
    assert.equal(result.success, true, result.stderr);
    assert.equal(result.exitCode, 0);
    assert.match(await readFile(join(root, "dist", "index.html"), "utf8"), /assets\//);
    assert.ok((await readdir(join(root, "dist", "assets"))).some((name) => name.endsWith(".js")));
  } finally { await rm(root, { recursive: true, force: true }); }
});
