import { test, expect } from "@playwright/test";
import { createServer } from "node:http";
import { readFile, realpath } from "node:fs/promises";
import { basename } from "node:path";
import { startPreview, stopPreview } from "../../lib/sandbox/local-sandbox.ts";

test.use({ trace: "off", screenshot: "off", colorScheme: "light", actionTimeout: 10_000 });
test.skip(!process.env.PROMPT_EVAL_ROOT, "需要真实模型生成样本，不使用Mock页面");

for (const kind of ["待办", "记账"]) {
  test(`短需求${kind}：视觉层级、空状态图形和手机排版`, async ({ page }, testInfo) => {
    const root = await realpath(process.env.PROMPT_EVAL_ROOT!);
    expect(basename(root)).toMatch(/^atoms-prompt-after-/);
    const records = JSON.parse(await readFile(`${root}/results.json`, "utf8")).results;
    const record = records.find((entry: { requirement: string }) => entry.requirement.includes(kind));
    expect(record?.model).toBe("deepseek-v4.1-flash");
    const directory = await realpath(record.directory);
    expect(directory.startsWith(`${root}/`)).toBe(true);
    const preview = await startPreview(record.projectId, directory);
    const host = createServer((_, res) => { res.setHeader("Content-Type", "text/html"); res.end('<!doctype html><link rel="icon" href="data:,"><style>body{margin:0}iframe{width:100vw;height:100vh;border:0}</style><iframe sandbox="allow-scripts allow-forms allow-same-origin"></iframe>'); });
    const errors: string[] = [], failures: number[] = [], external: string[] = [];
    page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
    page.on("pageerror", error => errors.push(error.message));
    page.on("response", response => { if (response.status() >= 400) failures.push(response.status()); });
    try {
      await new Promise<void>(resolve => host.listen(0, "127.0.0.1", resolve));
      const address = host.address();
      if (!address || typeof address === "string") throw Error("样本宿主未启动");
      const hostURL = `http://127.0.0.1:${address.port}/`, url = `http://127.0.0.1:${preview.port}/`;
      await page.route("**/*", route => {
        const origin = new URL(route.request().url()).origin;
        if ([new URL(hostURL).origin, new URL(url).origin].includes(origin)) return route.continue();
        external.push(origin); return route.abort();
      });
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(hostURL);
      await page.locator("iframe").evaluate((element: HTMLIFrameElement, url) => { element.src = url; }, url);
      const frame = page.frameLocator("iframe");
      const heading = frame.getByRole("heading", { level: 1 });
      await expect(heading).toBeVisible();
      // Missing deliberate type hierarchy or a drawn empty state catches the old flat output.
      const type = await heading.evaluate(el => ({ title: parseFloat(getComputedStyle(el).fontSize), body: parseFloat(getComputedStyle(document.body).fontSize) }));
      expect(type.title).toBeGreaterThanOrEqual(32);
      expect(type.title / type.body).toBeGreaterThanOrEqual(1.8);
      const empty = frame.getByText(kind === "待办" ? "还没有待办" : /^还没有(记账)?记录$/, { exact: true }).locator("..");
      const illustration = empty.locator('svg[aria-hidden="true"]');
      await expect(illustration).toBeVisible();
      const box = await illustration.boundingBox();
      expect(box?.width).toBeGreaterThanOrEqual(48);
      expect(box?.height).toBeGreaterThanOrEqual(48);
      await page.screenshot({ path: testInfo.outputPath(`${kind}-desktop.png`) });
      await page.setViewportSize({ width: 390, height: 844 });
      await expect(heading).toBeVisible();
      await expect.poll(() => frame.locator("body").evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      await page.screenshot({ path: testInfo.outputPath(`${kind}-mobile.png`) });
      expect(errors).toEqual([]); expect(failures).toEqual([]); expect(external).toEqual([]);
    } finally {
      stopPreview(record.projectId);
      if (host.listening) await new Promise<void>(resolve => host.close(() => resolve()));
    }
  });
}
