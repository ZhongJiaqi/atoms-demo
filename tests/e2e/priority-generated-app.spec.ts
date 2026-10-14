import { test, expect } from "@playwright/test";
import { readFile, realpath } from "node:fs/promises";
import { basename, join } from "node:path";
import { GENERATED_ROOT } from "../../lib/agent/files.ts";
import { startPreview, stopPreview } from "../../lib/sandbox/local-sandbox.ts";

test.use({ trace: "off", screenshot: "off", actionTimeout: 10_000, colorScheme: "light" });
test.skip(!process.env.E2E_PRIORITY_PROJECT_DIR, "需本地真实三轮生成成功的项目目录");

test("真实v3应用：高、中、低优先级操作及主题刷新持久化", async ({ page }) => {
  const directory = await realpath(process.env.E2E_PRIORITY_PROJECT_DIR!);
  expect(directory.startsWith(`${await realpath(GENERATED_ROOT)}/`)).toBe(true);
  const id = basename(directory);
  expect(id).toMatch(/^[0-9a-f-]{36}$/);
  const state = JSON.parse(await readFile(join(directory, "project-state.json"), "utf8"));
  expect(state.projectId).toBe(id);
  expect(state.currentVersion).toBe(3);
  expect(state.turns.at(-1)).toMatchObject({ status: "completed", model: "deepseek-v4.1-flash", requirement: "增加任务优先级，支持高、中、低三级，并保留已有任务和深色模式" });
  const preview = await startPreview(id, directory);
  const url = `http://127.0.0.1:${preview.port}/`;
  const errors: string[] = [], failures: number[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  page.on("response", response => { if (response.status() >= 400) failures.push(response.status()); });
  try {
    await page.setContent(`<style>body{margin:0}iframe{width:100vw;height:100vh;border:0}</style><iframe sandbox="allow-scripts allow-forms allow-same-origin" src="${url}"></iframe>`);
    const frame = page.frameLocator("iframe");
    const priority = frame.getByRole("group", { name: "新任务优先级", exact: true });
    for (const label of ["高", "中", "低"]) await expect(priority.getByRole("button", { name: `新任务设为${label}优先级`, exact: true })).toBeVisible();
    await priority.getByRole("button", { name: "新任务设为高优先级", exact: true }).click();
    await frame.getByTestId("task-input").fill("优先级实际操作验收");
    await frame.getByTestId("add-task").click();
    const item = frame.getByTestId("task-item").filter({ hasText: "优先级实际操作验收" });
    const expectPriority = async (selected: string) => {
      for (const label of ["高", "中", "低"]) {
        await expect(item.getByRole("button", { name: `设为${label}优先级`, exact: true })).toHaveAttribute("aria-pressed", String(label === selected));
      }
    };
    await expectPriority("高");
    const realFrame = page.frames().find(frame => frame.url() === url)!;
    await realFrame.goto(url, { waitUntil: "networkidle" });
    await expectPriority("高");
    for (const label of ["低", "中"]) {
      await item.getByRole("button", { name: `设为${label}优先级`, exact: true }).click();
      await realFrame.goto(url, { waitUntil: "networkidle" });
      await expectPriority(label);
    }
    const brightness = () => frame.locator("body").evaluate(el => {
      const channels = getComputedStyle(el).backgroundColor.match(/[\d.]+/g)!.map(Number);
      return .2126 * channels[0] + .7152 * channels[1] + .0722 * channels[2];
    });
    await expect.poll(brightness).toBeGreaterThan(170);
    await frame.getByRole("button", { name: "切换到深色模式", exact: true }).click();
    await expect.poll(brightness).toBeLessThan(150);
    await realFrame.goto(url, { waitUntil: "networkidle" });
    await expect.poll(brightness).toBeLessThan(150);
    await expect(item).toBeVisible();
    await expectPriority("中");
    expect(errors).toEqual([]);
    expect(failures).toEqual([]);
  } finally { stopPreview(id); }
});
