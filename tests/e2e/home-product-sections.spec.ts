import { expect, test } from "@playwright/test";

// 公开首页真实 UI 验收，不调用模型、不创建项目、不模拟产品结果。
test("首页产品介绍出现在我的项目之后，保留需求入口", async ({ page }, testInfo) => {
  const errors: string[] = [];
  const failures: number[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  page.on("response", (response) => { if (response.status() >= 400) failures.push(response.status()); });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  const sections = page.locator(".home-product-section");
  await expect(sections).toHaveCount(3);
  const projects = await page.getByRole("region", { name: "我的项目" }).boundingBox();
  const first = await sections.first().boundingBox();
  expect(first!.y).toBeGreaterThanOrEqual(projects!.y + projects!.height);
  expect(first!.height).toBeGreaterThanOrEqual(800);
  for (const section of await sections.all()) {
    await section.scrollIntoViewIfNeeded();
    await expect(section.getByRole("heading", { level: 2 })).toBeInViewport();
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("home-product-desktop.png"), fullPage: true, animations: "disabled" });
  expect(errors).toEqual([]);
  expect(failures).toEqual([]);
});

test("产品介绍的开始入口返回并聚焦现有需求框，不提交模型请求", async ({ page }) => {
  let generationRequests = 0;
  page.on("request", (request) => { if (new URL(request.url()).pathname === "/api/generate") generationRequests += 1; });
  await page.goto("/");
  const requirement = page.getByLabel("描述你想创建的应用");
  await requirement.fill("我的应用想法");
  const start = page.getByRole("link", { name: "从一个想法开始" });
  await start.scrollIntoViewIfNeeded();
  await start.click();
  await expect(requirement).toBeFocused();
  await expect(requirement).toBeInViewport();
  await expect(requirement).toHaveValue("我的应用想法");
  await expect(page.locator(".workspace-shell")).toHaveCount(0);
  expect(generationRequests).toBe(0);
});

test("窄屏、低高度和减弱动效下介绍自然滚动可达且不横向溢出", async ({ page }, testInfo) => {
  for (const size of [{ width: 320, height: 640 }, { width: 375, height: 812 }, { width: 720, height: 450 }, { width: 1440, height: 500 }]) {
    await page.setViewportSize(size);
    await page.goto("/");
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).scrollSnapType)).toBe("none");
    for (const section of await page.locator(".home-product-section").all()) {
      await section.getByRole("heading", { level: 2 }).scrollIntoViewIfNeeded();
      await expect(section.getByRole("heading", { level: 2 })).toBeInViewport();
    }
    const start = page.getByRole("link", { name: "从一个想法开始" });
    await start.scrollIntoViewIfNeeded();
    await expect(start).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`home-product-${size.width}-${size.height}.png`), fullPage: true, animations: "disabled" });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).scrollSnapType)).toBe("none");
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior)).toBe("auto");
});
