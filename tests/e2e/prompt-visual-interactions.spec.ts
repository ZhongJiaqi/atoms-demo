import { test, expect, type Frame, type Page } from "@playwright/test";
import { createServer } from "node:http";
import { readFile, realpath } from "node:fs/promises";
import { basename } from "node:path";
import { startPreview, stopPreview } from "../../lib/sandbox/local-sandbox.ts";

test.use({ trace: "off", screenshot: "off", colorScheme: "light", actionTimeout: 10_000 });
test.skip(!process.env.PROMPT_EVAL_ROOT, "需要真实模型生成样本，不使用Mock页面");

async function withSample(page: Page, kind: string, run: (frame: Frame, url: string) => Promise<void>) {
  const root = await realpath(process.env.PROMPT_EVAL_ROOT!);
  expect(basename(root)).toMatch(/^atoms-prompt-after-/);
  const records = JSON.parse(await readFile(`${root}/results.json`, "utf8")).results;
  const record = records.find((entry: { requirement: string }) => entry.requirement.includes(kind));
  expect(record?.model).toBe("deepseek-v4.1-flash");
  const directory = await realpath(record.directory);
  expect(directory.startsWith(`${root}/`)).toBe(true);
  const host = createServer((_, res) => {
    res.setHeader("Content-Type", "text/html");
    res.end('<!doctype html><link rel="icon" href="data:,"><style>body{margin:0}iframe{width:100vw;height:100vh;border:0}</style><iframe sandbox="allow-scripts allow-forms allow-same-origin"></iframe>');
  });
  const errors: string[] = [], failures: string[] = [], external: string[] = [];
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  page.on("pageerror", error => errors.push(error.message));
  page.on("response", response => {
    if (response.status() >= 400) failures.push(`${response.status()} ${response.url()}`);
  });
  try {
    const preview = await startPreview(record.projectId, directory);
    await new Promise<void>(resolve => host.listen(0, "127.0.0.1", resolve));
    const address = host.address();
    if (!address || typeof address === "string") throw Error("样本宿主未启动");
    const hostURL = `http://127.0.0.1:${address.port}/`, url = `http://127.0.0.1:${preview.port}/`;
    await page.route("**/*", route => {
      const origin = new URL(route.request().url()).origin;
      if ([new URL(hostURL).origin, new URL(url).origin].includes(origin)) return route.continue();
      external.push(origin);
      return route.abort();
    });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(hostURL);
    const element = await page.locator("iframe").elementHandle();
    const frame = await element?.contentFrame();
    if (!frame) throw Error("样本iframe不存在");
    await frame.goto(url);
    await expect(frame.getByRole("heading", { level: 1 })).toBeVisible();
    await run(frame, url);
  } finally {
    stopPreview(record.projectId);
    if (host.listening) await new Promise<void>(resolve => host.close(() => resolve()));
    expect.soft(errors, "样本应无console/page error").toEqual([]);
    expect.soft(failures, "样本应无4xx/5xx响应").toEqual([]);
    expect.soft(external, "样本应无外部请求").toEqual([]);
  }
}

async function fitsMobile(page: Page, frame: Frame) {
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => frame.locator("body").evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
}

// Removing an add/edit/toggle/delete/search handler or persistence write must break this workflow.
test("真实待办：增搜改完成删除及刷新持久化，手机可添加", async ({ page }) => {
  await withSample(page, "待办", async (frame, url) => {
    await expect(frame.getByText("还没有待办", { exact: true })).toBeVisible();
    const add = frame.getByRole("textbox", { name: "新的待办内容" });
    for (const text of ["整理验收资料", "购买验收咖啡"]) {
      await add.fill(text);
      await frame.getByRole("button", { name: "添加", exact: true }).click();
      await expect(frame.getByText(text, { exact: true })).toBeVisible();
    }
    const search = frame.getByRole("textbox", { name: "搜索待办" });
    await search.fill("资料");
    await expect(frame.getByText("整理验收资料", { exact: true })).toBeVisible();
    await expect(frame.getByText("购买验收咖啡", { exact: true })).toHaveCount(0);
    await search.fill("不存在的验收任务");
    await expect(frame.getByRole("listitem")).toHaveCount(0);
    await expect(frame.getByText("没有符合条件的待办", { exact: true })).toBeVisible();
    await search.fill("");
    const edited = frame.getByRole("listitem").filter({ hasText: "整理验收资料" });
    await edited.getByRole("button", { name: "编辑", exact: true }).click();
    const draft = frame.getByRole("textbox", { name: "编辑待办内容" });
    await draft.fill("整理验收资料已核对");
    await draft.press("Enter");
    const completed = frame.getByRole("listitem").filter({ hasText: "整理验收资料已核对" });
    await completed.getByRole("checkbox").click();
    await expect(completed.getByRole("checkbox")).toBeChecked();
    const removed = frame.getByRole("listitem").filter({ hasText: "购买验收咖啡" });
    await removed.getByRole("button", { name: "删除", exact: true }).click();
    const dialog = frame.getByRole("alertdialog", { name: "确认删除" });
    await expect(dialog).toBeVisible();
    await expect(frame.getByText("购买验收咖啡", { exact: true })).toBeVisible();
    await dialog.getByRole("button", { name: "删除", exact: true }).click();
    await expect(frame.getByText("购买验收咖啡", { exact: true })).toHaveCount(0);
    await frame.goto(url);
    await expect(frame.getByText("整理验收资料已核对", { exact: true })).toBeVisible();
    await expect(frame.getByRole("listitem").filter({ hasText: "整理验收资料已核对" }).getByRole("checkbox")).toBeChecked();
    await expect(frame.getByText("购买验收咖啡", { exact: true })).toHaveCount(0);
    await fitsMobile(page, frame);
    await add.fill("手机验收任务");
    await frame.getByRole("button", { name: "添加", exact: true }).click();
    await expect(frame.getByText("手机验收任务", { exact: true })).toBeVisible();
    await fitsMobile(page, frame);
  });
});

// Missing editing, incorrect totals, ineffective search, or lost writes must break this workflow.
test("真实记账：零账户增搜改删、精确结余及刷新持久化，手机无溢出", async ({ page }) => {
  await withSample(page, "记账", async (frame, url) => {
    const balance = frame.getByText("当前结余", { exact: true }).locator("..");
    async function totals(expense: string, remaining: string) {
      await expect(balance.locator(".balance-value")).toHaveText(`¥${remaining}`);
      await expect(balance.getByText("收入", { exact: true }).locator("..").locator(".split-value")).toHaveText("+¥0.00");
      await expect(balance.getByText("支出", { exact: true }).locator("..").locator(".split-value")).toHaveText(`-¥${expense}`);
    }
    await expect(frame.getByText("还没有记录", { exact: true })).toBeVisible();
    await totals("0.00", "0.00");
    const form = frame.locator("form");
    await expect(form).toHaveCount(1);
    await form.getByLabel("金额", { exact: true }).fill("88.50");
    await form.getByLabel("分类", { exact: true }).selectOption({ label: "餐饮" });
    await form.getByLabel("备注", { exact: true }).fill("午餐验收");
    await form.getByRole("button", { name: "添加记录", exact: true }).click();
    const record = frame.getByRole("listitem").filter({ hasText: "午餐验收" });
    await expect(record).toBeVisible();
    await expect(record.locator(".tx-amount")).toHaveText("-¥88.50");
    await totals("88.50", "-88.50");
    // The first real sample failed here; editing remains a required user action.
    const edit = record.getByRole("button", { name: "编辑 餐饮 记录", exact: true });
    await expect(edit, "每条记账记录必须提供可操作的编辑按钮").toBeVisible({ timeout: 5_000 });
    await edit.click();
    await expect(form.getByRole("heading", { name: "编辑记录", exact: true })).toBeVisible();
    await expect(form.getByLabel("金额", { exact: true })).toHaveValue("88.5");
    await form.getByLabel("金额", { exact: true }).fill("90");
    await form.getByRole("button", { name: "保存修改", exact: true }).click();
    await expect(record).toHaveCount(1);
    await expect(record.locator(".tx-amount")).toHaveText("-¥90.00");
    await totals("90.00", "-90.00");
    const search = frame.getByRole("searchbox", { name: "搜索记录" });
    await search.fill("午餐验收");
    await expect(record).toBeVisible();
    await search.fill("不存在的验收记录");
    await expect(frame.getByRole("listitem")).toHaveCount(0);
    await totals("90.00", "-90.00");
    await search.fill("");
    await frame.goto(url);
    await expect(record).toBeVisible();
    await expect(record.locator(".tx-amount")).toHaveText("-¥90.00");
    await totals("90.00", "-90.00");
    await fitsMobile(page, frame);
    await record.getByRole("button", { name: /删除/ }).click();
    const dialog = frame.getByRole("alertdialog");
    await expect(dialog).toBeVisible();
    await expect(record).toBeVisible();
    await dialog.getByRole("button", { name: "确认删除", exact: true }).click();
    await expect(record).toHaveCount(0);
    await totals("0.00", "0.00");
    await frame.goto(url);
    await expect(record).toHaveCount(0);
    await expect(frame.getByText("还没有记录", { exact: true })).toBeVisible();
    await totals("0.00", "0.00");
    await fitsMobile(page, frame);
  });
});
