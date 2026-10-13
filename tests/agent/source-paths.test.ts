import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { hydrateProjectDirectoryAt, loadGeneratedProject, mergeProjectPatch, validateProject, writeGeneratedFiles, writeProjectPatch } from "../../lib/agent/files.ts";

const project = {
  projectName: "类型文件测试",
  summary: "使用独立类型文件",
  files: [
    { path: "src/App.tsx", content: 'import type { Task } from "./types"; export default function App(){const task: Task = {title: "测试"}; return <main>{task.title}</main>}' },
    { path: "src/styles.css", content: "body{margin:0}" },
    { path: "src/types.ts", content: "export type Task = {title: string};" },
  ],
};
const state = {
  projectId: "123e4567-e89b-42d3-a456-426614174000", projectName: project.projectName,
  summary: project.summary, currentVersion: 1, createdAt: "2026-10-14T00:00:00Z",
  updatedAt: "2026-10-14T00:00:00Z", messages: [], turns: [],
};

test("生成和恢复允许 src/types.ts，并保留类型文件用于后续修改", async () => {
  validateProject(project);
  const root = await mkdtemp(join(tmpdir(), "atoms-types-"));
  try {
    const dir = await hydrateProjectDirectoryAt(root, state, project);
    assert.equal(await readFile(join(dir, "src/types.ts"), "utf8"), project.files[2].content);
    assert.deepEqual((await loadGeneratedProject(dir, state)).files, [...project.files].sort((a, b) => a.path.localeCompare(b.path)));
    const patch = mergeProjectPatch(project, {
      summary: "增加优先级类型", deletedFiles: [],
      files: [{ path: "src/types.ts", content: "export type Task = {title: string; priority?: number};" }],
    });
    await writeProjectPatch(dir, patch.project, patch.changedFiles, patch.deletedFiles);
    assert.match(await readFile(join(dir, "src/types.ts"), "utf8"), /priority/);
    const removed = mergeProjectPatch(patch.project, {
      summary: "移除不再使用的类型文件", deletedFiles: ["src/types.ts"],
      files: [{ path: "src/App.tsx", content: "export default function App(){return <main>测试</main>}" }],
    });
    await writeGeneratedFiles(dir, removed.project);
    await assert.rejects(readFile(join(dir, "src/types.ts"), "utf8"), { code: "ENOENT" });
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("允许类型文件后仍拒绝目录越界、入口和配置文件覆盖", () => {
  for (const path of ["src/../types.ts", "src/types.ts/../App.tsx", "/src/types.ts", "src/main.tsx", "package.json", "vite.config.mjs", "src/types.js"]) {
    assert.throws(() => validateProject({ ...project, files: [...project.files.slice(0, 2), { path, content: "export {};" }] }), /不允许的生成文件路径/);
  }
});
