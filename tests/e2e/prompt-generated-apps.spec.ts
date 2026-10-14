import { test, expect, type Page } from "@playwright/test";
import { createServer } from "node:http";
import { readFile, realpath } from "node:fs/promises";
import { join, basename } from "node:path";
import { EnvHttpProxyAgent, setGlobalDispatcher } from "undici";
import { startPreview, stopPreview, buildProject } from "../../lib/sandbox/local-sandbox.ts";
import { loadGeneratedProject, mergeProjectPatch, writeGeneratedFiles } from "../../lib/agent/files.ts";
import { modifyProject } from "../../lib/agent/model.ts";
import sharp from "sharp";

test.use({ trace: "off", screenshot: "off", colorScheme: "light", actionTimeout: 10_000 });
test.skip(!process.env.PROMPT_EVAL_ROOT, "需要真实模型生成的评估目录");
const host = createServer((req, res) => {
  res.setHeader("Content-Type", "text/html");
  res.end('<!doctype html><link rel="icon" href="data:,"><body style="margin:0"><iframe style="width:100vw;height:100vh;border:0" sandbox="allow-scripts allow-forms allow-same-origin"></iframe>');
});
let root = "";
let records: Array<{ requirement: string; directory: string; projectId: string }> = [];
test.beforeAll(async () => {
  root = await realpath(process.env.PROMPT_EVAL_ROOT!);
  expect(basename(root)).toMatch(/^atoms-prompt-after-/);
  records = JSON.parse(await readFile(join(root, "results.json"), "utf8")).results;
  await new Promise<void>(resolve => host.listen(0, "127.0.0.1", resolve));
  setGlobalDispatcher(new EnvHttpProxyAgent({ noProxy: "localhost,127.0.0.1" }));
});
test.afterAll(async () => { if (host.listening) await new Promise<void>(resolve => host.close(() => resolve())); });

async function open(page: Page, kind: string) {
  const record = records.find(record => record.requirement.includes(kind))!;
  expect(record).toBeTruthy();
  const directory = await realpath(record.directory);
  expect(directory.startsWith(`${root}/`)).toBe(true);
  const entry = await startPreview(record.projectId, directory);
  const address = host.address();
  if (!address || typeof address === "string") throw Error("缺少验收页面地址");
  const hostURL = `http://127.0.0.1:${address.port}/`, url = `http://127.0.0.1:${entry.port}/`;
  const errors: string[] = [], badResponses: number[] = [], external: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  page.on("response", response => { if (response.status() >= 400) badResponses.push(response.status()); });
  page.on("dialog", dialog => dialog.accept());
  await page.route("**/*", route => {
    const parsed = new URL(route.request().url());
    if ([new URL(hostURL).origin, new URL(url).origin].includes(parsed.origin)) return route.continue();
    external.push(parsed.hostname); return route.abort();
  });
  await page.goto(hostURL);
  await page.locator("iframe").evaluate((element: HTMLIFrameElement, url) => { element.src = url; }, url);
  const frame = page.frameLocator("iframe");
  await expect(frame.getByRole("heading", { level: 1 })).toBeVisible();
  return { record, frame, url, verify: () => { expect(errors).toEqual([]); expect(badResponses).toEqual([]); expect(external).toEqual([]); } };
}

test("简单待办需求：真实添加编辑、搜索、完成删除、刷新和手机", async ({ page }) => {
  const { record, frame, url, verify } = await open(page, "待办");
  const tasks = frame.locator("li.todo-item");
  try {
    await expect(tasks).toHaveCount(0);
    const input = frame.getByRole("textbox", { name: "新任务" });
    await input.fill("准备展示"); await input.press("Enter");
    await input.fill("整理资料"); await input.press("Enter");
    await expect(tasks).toHaveCount(2);
    const search = frame.getByRole("searchbox", { name: "搜索任务" });
    await search.fill("展示");
    await expect(tasks).toHaveCount(1);
    await expect(tasks).toContainText("准备展示");
    await search.fill("没有这一条"); await expect(tasks).toHaveCount(0);
    await search.fill(""); await expect(tasks).toHaveCount(2);
    const item = tasks.filter({ hasText: "准备展示" });
    await item.getByRole("button", { name: /^编辑/ }).click();
    await frame.getByRole("textbox", { name: "编辑任务内容" }).fill("准备正式展示");
    await frame.getByRole("button", { name: "保存", exact: true }).click();
    const updated = tasks.filter({ hasText: "准备正式展示" });
    await updated.getByRole("checkbox").check();
    await expect(updated.getByRole("checkbox")).toBeChecked();
    await tasks.filter({ hasText: "整理资料" }).getByRole("button", { name: /^删除/ }).click();
    await frame.getByRole("alertdialog", { name: "确认删除任务" }).getByRole("button", { name: "删除", exact: true }).click();
    await expect(tasks).toHaveCount(1);
    const real = page.frames().find(frame => frame.url() === url)!;
    await real.goto(url, { waitUntil: "networkidle" });
    await expect(updated.getByRole("checkbox")).toBeChecked();
    await page.setViewportSize({ width: 390, height: 844 });
    await input.fill("手机临时任务"); await input.press("Enter");
    await expect(tasks).toHaveCount(2);
    await expect.poll(() => frame.locator("body").evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    verify();
  } finally { stopPreview(record.projectId); }
});

test("简单记账需求：空账户、精确金额、编辑删除、过滤和刷新", async ({ page }) => {
  const { record, frame, url, verify } = await open(page, "记账");
  try {
    await expect(frame.getByRole("listitem")).toHaveCount(0);
    const overview = frame.getByRole("region", { name: "收支概览" });
    await expect(overview).toContainText("¥0.00");
    await frame.getByRole("spinbutton", { name: "金额", exact: true }).fill("88.50");
    await frame.getByRole("textbox", { name: "备注", exact: true }).fill("午餐验收");
    await frame.getByRole("button", { name: "添加", exact: true }).click();
    await expect(frame.getByRole("listitem")).toHaveCount(1);
    const expense = overview.locator(".stat-card").filter({ hasText: "总支出" }).locator(".stat-value");
    await expect(expense).toHaveText("¥88.50");
    await frame.getByRole("listitem").getByRole("button", { name: /编辑/ }).click();
    await frame.getByRole("spinbutton", { name: "金额", exact: true }).fill("90");
    await frame.getByRole("button", { name: "保存修改", exact: true }).click();
    await expect(expense).toHaveText("¥90.00");
    const search = frame.getByRole("searchbox", { name: "搜索记录" });
    await search.fill("不匹配"); await expect(frame.getByRole("listitem")).toHaveCount(0);
    await search.fill("午餐"); await expect(frame.getByRole("listitem")).toHaveCount(1);
    await page.frames().find(frame => frame.url() === url)!.goto(url, { waitUntil: "networkidle" });
    await expect(frame.getByRole("listitem")).toContainText("午餐验收");
    await expect(expense).toHaveText("¥90.00");
    await frame.getByRole("listitem").getByRole("button", { name: /删除/ }).click();
    const confirmation = frame.getByRole("dialog").or(frame.getByRole("alertdialog"));
    if (await confirmation.count()) await confirmation.getByRole("button", { name: /确认|确定|删除/ }).click();
    await expect(frame.getByRole("listitem")).toHaveCount(0);
    await expect(expense).toHaveText("¥0.00");
    verify();
  } finally { stopPreview(record.projectId); }
});

test("优化 Prompt 后仍可在原项目真实修改，保留源码与用户记录", async ({ page }) => {
  const { record, frame, url, verify } = await open(page, "待办");
  let original: Awaited<ReturnType<typeof loadGeneratedProject>> | undefined;
  try {
    await frame.getByRole("textbox", { name: "新任务" }).fill("修改后必须保留");
    await frame.getByRole("button", { name: "添加", exact: true }).click();
    const metadata = JSON.parse(await readFile(join(record.directory, "generation.json"), "utf8"));
    original = await loadGeneratedProject(record.directory, metadata);
    process.env.LLM_MODEL = "deepseek-v4.1-flash";
    const modified = await modifyProject("增加深色模式，并保留已有功能和数据", original, [record.requirement]);
    expect(modified.model).toBe("deepseek-v4.1-flash");
    const patch = mergeProjectPatch(original, modified.patch);
    expect(patch.changedFiles.length).toBeGreaterThan(0);
    await writeGeneratedFiles(record.directory, patch.project);
    expect((await buildProject(record.directory)).success).toBe(true);
    await page.frames().find(frame => frame.url() === url)!.goto(url, { waitUntil: "networkidle" });
    await expect(frame.getByRole("listitem").filter({ hasText: "修改后必须保留" })).toBeVisible();
    await frame.getByRole("textbox", { name: "新任务" }).fill("修改后新增");
    await frame.getByRole("button", { name: "添加", exact: true }).click();
    await expect(frame.getByRole("listitem")).toHaveCount(2);
    const darkControl = frame.getByRole("button", { name: /深色|暗黑/ }).first();
    await expect(darkControl).toBeVisible();
    const input = frame.getByRole("textbox", { name: "新任务" });
    async function brightness() {
      const box = await input.boundingBox();
      if (!box) throw Error("主题验收输入框不可见");
      const { data, info } = await sharp(await page.screenshot()).raw().toBuffer({ resolveWithObject: true });
      const at = (Math.floor(box.y + box.height * .7) * info.width + Math.floor(box.x + box.width * .85)) * info.channels;
      return .2126 * data[at] + .7152 * data[at + 1] + .0722 * data[at + 2];
    }
    await expect.poll(brightness).toBeGreaterThan(170);
    await darkControl.click();
    await expect.poll(brightness).toBeLessThan(150);
    const item = frame.getByRole("listitem").filter({ hasText: "修改后必须保留" });
    await item.getByRole("button", { name: /^编辑/ }).click();
    await frame.getByRole("textbox", { name: "编辑任务内容" }).fill("修改后保留且可编辑");
    await frame.getByRole("button", { name: "保存", exact: true }).click();
    const edited = frame.getByRole("listitem").filter({ hasText: "修改后保留且可编辑" });
    await edited.getByRole("checkbox").check();
    const search = frame.getByRole("searchbox", { name: "搜索任务" });
    await search.fill("可编辑");
    await expect(frame.locator("li.todo-item")).toHaveCount(1);
    await search.fill("");
    await page.frames().find(frame => frame.url() === url)!.goto(url, { waitUntil: "networkidle" });
    await expect(frame.getByRole("listitem")).toHaveCount(2);
    await expect(edited.getByRole("checkbox")).toBeChecked();
    await expect.poll(brightness).toBeLessThan(150);
    await frame.getByRole("button", { name: /浅色/ }).first().click();
    await expect.poll(brightness).toBeGreaterThan(170);
    verify();
  } finally {
    try {
      if (original) {
        await writeGeneratedFiles(record.directory, original);
        expect((await buildProject(record.directory)).success).toBe(true);
      }
    } finally { stopPreview(record.projectId); }
  }
});
