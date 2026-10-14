import { expect, test } from "@playwright/test";

// 尺寸/键盘/触控的真实浏览器验收；工作区使用明确的 API 契约样本，不冒充模型或数据库验收。
test("手机登录入口可达、触控目标充分且首页和认证页不横向溢出", async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  const failures: number[] = [];
  page.on("response", (response) => { if (response.status() >= 400) failures.push(response.status()); });
  for (const width of [320, 375, 768, 1440, 2560]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await expect(page.getByRole("link", { name: "登录", exact: true })).toBeVisible();
    const start = await page.getByRole("button", { name: /^开始/ }).boundingBox();
    expect(start!.height).toBeGreaterThanOrEqual(44);
    expect(start!.width).toBeGreaterThanOrEqual(100);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`home-${width}.png`), fullPage: true, animations: "disabled" });
    await page.goto("/login");
    await expect(page.getByLabel("邮箱")).toBeVisible();
    expect(await page.getByLabel("邮箱").evaluate((el) => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(16);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`login-${width}.png`), fullPage: true, animations: "disabled" });
  }
  expect(errors).toEqual([]); expect(failures).toEqual([]);
});

test("工作区在窄屏及缩放下保留历史入口、预览代码和键盘弹层操作", async ({ page }, testInfo) => {
  const projectId = "123e4567-e89b-42d3-a456-426614174000";
  const errors: string[] = []; const failures: number[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  page.on("response", (response) => { if (response.status() >= 400) failures.push(response.status()); });
  await page.route(`**/api/projects/${projectId}`, (route) => route.fulfill({ json: { files: [{ path: "src/App.tsx", content: "// 明确的 UI 契约样本" }] } }));
  await page.route("**/api/projects", (route) => route.fulfill({ json: { projects: [{ id: projectId, name: "响应式验收", current_version: 1, versions: [{ version: 1, name: "响应式验收", summary: "首版", created_at: "2026-10-14T00:00:00Z" }] }] } }));
  await page.route("**/api/generate", (route) => route.fulfill({ contentType: "text/event-stream", body: `event: complete\ndata: ${JSON.stringify({ mode: "create", projectId, version: 1, projectName: "响应式验收", summary: "首版", model: "UI契约样本", buildAttempts: 1, previewUrl: "about:blank", generatedFiles: [], changedFiles: [], deletedFiles: [] })}\n\n` }));
  await page.goto("/");
  await page.locator("#hero-requirement").fill("UI契约测试");
  await page.locator("#hero-requirement").press("Shift+Enter");
  await expect(page.locator("#hero-requirement")).toHaveValue("UI契约测试\n");
  await page.locator("#hero-requirement").dispatchEvent("keydown", { key: "Enter", isComposing: true });
  await expect(page.locator(".workspace-shell")).toHaveCount(0);
  await page.locator("#hero-requirement").press("Enter");
  await expect(page.locator(".workspace-shell")).toBeVisible({ timeout: 3000 });
  const refresh = page.getByRole("button", { name: "刷新预览", exact: true });
  await refresh.focus();
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Tab");
  await expect.poll(() => refresh.evaluate((el) => getComputedStyle(el, "::after").opacity)).toBe("1");
  for (const size of [{width:1440,height:900},{width:768,height:1024},{width:375,height:812},{width:812,height:375},{width:320,height:640}]) {
    await page.setViewportSize(size);
    await expect(page.getByRole("button", { name: "历史记录", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "历史记录", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "历史记录", exact: true });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("button", { name: "关闭历史记录" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    if (size.width <= 900) {
      await page.getByRole("navigation", { name: "工作区视图" }).getByRole("button", { name: "预览", exact: true }).click();
      await expect(page.getByTestId("generated-preview")).toBeVisible();
      await page.getByRole("navigation", { name: "工作区视图" }).getByRole("button", { name: "代码", exact: true }).click();
      await expect(page.locator(".code-viewer")).toBeVisible();
      await page.getByRole("navigation", { name: "工作区视图" }).getByRole("button", { name: "对话", exact: true }).click();
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const send = await page.getByRole("button", { name: "发送修改需求" }).boundingBox();
    expect(send!.y + send!.height).toBeLessThanOrEqual(size.height);
    await page.screenshot({ path: testInfo.outputPath(`workspace-${size.width}-${size.height}.png`), animations: "disabled" });
  }
  await page.setViewportSize({ width:1440, height:900 });
  for (const zoom of [0.8, 1.25, 2]) {
    // 模拟 1440×900 物理窗口在 80%/125%/200% 浏览器缩放下的有效 CSS viewport。
    // 不把 CSS zoom 或移动端 pinch-zoom 冒称桌面原生浏览器缩放。
    const height = Math.round(900 / zoom);
    await page.setViewportSize({ width: Math.round(1440 / zoom), height });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(page.getByRole("button", { name: "历史记录", exact: true })).toBeVisible();
    const send = await page.getByRole("button", { name: "发送修改需求" }).boundingBox();
    expect(send!.y + send!.height).toBeLessThanOrEqual(height);
  }
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(await page.locator(".workspace-shell").evaluate((el) => parseFloat(getComputedStyle(el).animationDuration))).toBeLessThanOrEqual(0.01);
  expect(errors).toEqual([]); expect(failures).toEqual([]);
});
