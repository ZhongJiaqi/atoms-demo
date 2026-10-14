import { expect as playwrightExpect, test, type Page } from "@playwright/test";

test.use({ actionTimeout: 10_000 });
const expect = playwrightExpect.configure({ timeout: 3_000 });

// 真实宿主 UI + 明确的非 AI API 契约样本，不代替模型、数据库或沙盒验收。
const projectId = "123e4567-e89b-42d3-a456-426614174000";
const savedProject = { projectId, projectName: "品牌导航契约项目", summary: "已保存的契约样本", currentVersion: 1, files: [], turns: [] };

function observe(page: Page) {
  const errors: string[] = [], failures: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  page.on("response", response => { if (response.status() >= 400) failures.push(`${response.status()} ${response.url()}`); });
  return () => { expect(errors).toEqual([]); expect(failures).toEqual([]); };
}

test("登录和注册页面品牌一致并能返回首页", async ({ page }) => {
  const clean = observe(page);
  for (const path of ["/login", "/login?mode=register"]) {
    await page.goto(path);
    const brand = page.getByRole("link", { name: "返回 Atoms Demo 首页", exact: true });
    await expect(brand).toContainText("Atoms Demo");
    await expect(brand).toHaveAttribute("href", "/");
  }
  await page.getByRole("link", { name: "返回 Atoms Demo 首页", exact: true }).click();
  await expect(page.locator("#hero-requirement")).toBeVisible();
  clean();
});

for (const width of [1470, 320, 375]) {
  test(`首页 ${width}px 完整显示 Atoms Demo 且不与登录区域重叠`, async ({ page }) => {
    const clean = observe(page);
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    const brand = page.locator(".landing-nav .atoms-logo");
    await expect(brand).toHaveText("Atoms Demo");
    await expect(brand).toHaveAttribute("aria-label", "Atoms Demo");
    const text = (await brand.locator("b").boundingBox())!, logo = (await brand.boundingBox())!, auth = (await page.locator(".landing-auth").boundingBox())!;
    expect(text.x).toBeGreaterThanOrEqual(logo.x);
    expect(text.x + text.width).toBeLessThanOrEqual(logo.x + logo.width + 1);
    expect(logo.x + logo.width).toBeLessThanOrEqual(auth.x);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    clean();
  });
}

for (const interaction of ["点击", "键盘 Enter"]) {
  test(`工作区品牌${interaction}返回真实首页且保留存储、不触发项目写入`, async ({ page }) => {
    const clean = observe(page);
    const writes: string[] = [];
    page.on("request", request => {
      if (new URL(request.url()).pathname.startsWith("/api/") && request.method() !== "GET") writes.push(`${request.method()} ${new URL(request.url()).pathname}`);
    });
    await page.route("**/api/projects", route => route.fulfill({ json: { projects: [] } }));
    await page.route(`**/api/projects/${projectId}`, route => route.fulfill({ json: savedProject }));
    await page.route(`**/api/projects/${projectId}/preview-status`, route => route.fulfill({ json: { active: true, currentVersion: 1, expiresAt: Date.now() + 900000 } }));
    await page.route("**/brand-preview-fixture", route => route.fulfill({ contentType: "text/html", body: "<main>非 AI 静态预览契约样本</main>" }));
    await page.route("**/api/generate", route => route.fulfill({ contentType: "text/event-stream", body: `event: complete\ndata: ${JSON.stringify({ mode: "create", projectId, version: 1, projectName: savedProject.projectName, summary: savedProject.summary, model: "非AI导航契约", buildAttempts: 1, previewReady: true, previewUrl: `${new URL(page.url()).origin}/brand-preview-fixture`, generatedFiles: [], changedFiles: [], deletedFiles: [] })}\n\n` }));
    await page.goto("/");
    await page.locator("#hero-requirement").fill("导航契约样本");
    await page.getByRole("button", { name: /^开始/ }).click();
    await expect(page.locator(".conversation-turn[data-status=completed]")).toBeVisible();
    await page.evaluate(() => { localStorage.setItem("brand-navigation-fixture", "preserved"); sessionStorage.setItem("brand-navigation-fixture", "preserved"); });
    const home = page.getByRole("link", { name: "Atoms Demo，返回首页", exact: true });
    await expect(home).toHaveAttribute("href", "/");
    await expect(home).toHaveAttribute("title", "返回首页");
    if (interaction === "点击") await home.click();
    else { await home.focus(); await expect(home).toBeFocused(); await home.press("Enter"); }
    await page.waitForURL(url => url.pathname === "/" && !url.search);
    await expect(page.locator("#hero-requirement")).toBeVisible();
    await expect(page.locator(".landing-nav .atoms-logo")).toHaveText("Atoms Demo");
    expect(await page.evaluate(() => [localStorage.getItem("brand-navigation-fixture"), sessionStorage.getItem("brand-navigation-fixture")])).toEqual(["preserved", "preserved"]);
    expect(writes).toEqual(["POST /api/generate"]);
    clean();
  });
}

test("生成期间品牌保留首页href但阻止点击与Enter中断任务", async ({ page }) => {
  const clean = observe(page);
  let generations = 0;
  page.on("request", request => { if (new URL(request.url()).pathname === "/api/generate") generations++; });
  await page.route("**/api/generate", () => {});
  await page.goto("/");
  await page.evaluate(() => { localStorage.setItem("brand-navigation-fixture", "preserved"); sessionStorage.setItem("brand-navigation-fixture", "preserved"); });
  await page.locator("#hero-requirement").fill("挂起的非AI导航契约");
  await page.getByRole("button", { name: /^开始/ }).click();
  const running = page.locator(".chat-composer").getByRole("status");
  await expect(running).toHaveText("正在执行");
  const home = page.getByRole("link", { name: "Atoms Demo，返回首页", exact: true });
  await expect(home).toHaveAttribute("href", "/");
  await expect(home).toHaveAttribute("aria-disabled", "true");
  await expect(home).toHaveAttribute("title", "生成或恢复完成后返回首页");
  await home.click({ force: true });
  await expect(running).toHaveText("正在执行");
  await home.focus(); await home.press("Enter");
  await expect(running).toHaveText("正在执行");
  expect(await page.evaluate(() => [localStorage.getItem("brand-navigation-fixture"), sessionStorage.getItem("brand-navigation-fixture")])).toEqual(["preserved", "preserved"]);
  expect(generations).toBe(1);
  clean();
});
