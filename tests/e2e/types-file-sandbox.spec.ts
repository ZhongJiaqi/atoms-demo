import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

import { GENERATED_ROOT, hydrateProjectDirectoryAt } from "../../lib/agent/files";
import { activateStagedPreview, buildProject, getPreview, startPreview, stopPreview } from "../../lib/sandbox/local-sandbox";

test("含独立类型文件的回归项目可在受控沙盒构建并通过 iframe 交互", async ({ page }) => {
  const projectId = randomUUID();
  const promotedId = randomUUID();
  await mkdir(GENERATED_ROOT, { recursive: true });
  const root = await mkdtemp(join(GENERATED_ROOT, "types-regression-"));
  const errors: string[] = [];
  const failures: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  page.on("response", (response) => { if (response.status() >= 400) failures.push(`${response.status()} ${response.url()}`); });
  const project = {
    projectName: "类型文件回归", summary: "验证类型导入与按钮交互",
    files: [
      { path: "src/types.ts", content: "export type Counter = {count: number};" },
      { path: "src/App.tsx", content: 'import {useState} from "react"; import type {Counter} from "./types"; export default function App(){const [state,setState]=useState<Counter>({count:0}); return <button onClick={()=>setState({count:state.count+1})}>计数 {state.count}</button>}' },
      { path: "src/styles.css", content: "body{margin:0} button{padding:20px}" },
    ],
  };
  try {
    const dir = await hydrateProjectDirectoryAt(root, {
      projectId, projectName: project.projectName, summary: project.summary, currentVersion: 1,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), messages: [], turns: [],
    }, project);
    const build = await buildProject(dir);
    expect(build.success, build.stderr || build.stdout).toBe(true);
    const preview = await startPreview(projectId, dir);
    await page.setContent(`<iframe title="类型文件预览" sandbox="allow-scripts allow-same-origin" src="http://127.0.0.1:${preview.port}/"></iframe>`);
    const frame = page.frameLocator("iframe");
    await frame.getByRole("button", { name: "计数 0", exact: true }).click();
    await expect(frame.getByRole("button", { name: "计数 1", exact: true })).toBeVisible();
    expect(errors).toEqual([]);
    expect(failures).toEqual([]);
    const exited = once(preview.process, "exit");
    stopPreview(projectId);
    await exited;
    expect(activateStagedPreview(preview, promotedId)).toEqual({ activated: false });
    expect(getPreview(promotedId)).toBeNull();
  } finally {
    stopPreview(projectId);
    stopPreview(promotedId);
    await rm(root, { recursive: true, force: true });
  }
});
