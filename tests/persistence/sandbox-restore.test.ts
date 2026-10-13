import assert from "node:assert/strict";
import { mkdtemp, readFile, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { hydrateProjectDirectoryAt } from "../../lib/agent/files.ts";

test("持久化源码可重建完整 Vite 项目目录和 Agent 状态", async () => {
  const root = await mkdtemp(join(tmpdir(), "atoms-restore-"));
  const projectId = "123e4567-e89b-42d3-a456-426614174000";
  const state = {
    projectId,
    projectName: "Todo App",
    summary: "可恢复 Todo",
    currentVersion: 2,
    createdAt: "2026-10-13T00:00:00.000Z",
    updatedAt: "2026-10-13T00:02:00.000Z",
    messages: [],
    turns: [],
  };
  const project = {
    projectName: state.projectName,
    summary: state.summary,
    files: [
      { path: "src/App.tsx", content: "export default function App(){return <main>恢复成功</main>}" },
      { path: "src/styles.css", content: "body{margin:0}" },
    ],
  };

  try {
    const projectDir = await hydrateProjectDirectoryAt(root, state, project);
    assert.equal(projectDir, join(await realpath(root), projectId));
    assert.match(await readFile(join(projectDir, "package.json"), "utf8"), /atoms-generated-app/);
    assert.match(await readFile(join(projectDir, "src/App.tsx"), "utf8"), /恢复成功/);
    assert.equal(JSON.parse(await readFile(join(projectDir, "project-state.json"), "utf8")).currentVersion, 2);
    assert.equal(JSON.parse(await readFile(join(projectDir, ".atoms/versions/2/manifest.json"), "utf8")).version, 2);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
