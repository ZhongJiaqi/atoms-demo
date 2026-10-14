import { expect, test } from "@playwright/test";

test("预览状态接口在未登录时拒绝读取", async ({ request }) => {
  expect((await request.get("/api/projects/123e4567-e89b-42d3-a456-426614174000/preview-status")).status()).toBe(401);
});

// 此用例是UI状态机契约，不代替真实沙盒恢复；真实恢复由version-rollback.spec覆盖。
test("失效预览在返回工作区时自动恢复、重复焦点去重且不重建项目", async ({ page }) => {
  const projectId = "123e4567-e89b-42d3-a456-426614174000";
  let active = true; let resumes = 0; let release!: () => void;
  const wait = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/ui-preview", (route) => route.fulfill({ contentType: "text/html; charset=utf-8", body: '<button onclick="this.textContent=\'已点击\'">测试按钮</button>' }));
  await page.route(`**/api/projects/${projectId}/preview-status`, (route) => route.fulfill({ json: { active, currentVersion: 1, expiresAt: active ? Date.now() + 900000 : null } }));
  await page.route(`**/api/projects/${projectId}/resume`, async (route) => {
    resumes++; await wait; active = true;
    await route.fulfill({ json: { projectId, currentVersion: 1, previewUrl: `${new URL(page.url()).origin}/ui-preview` } });
  });
  await page.route(`**/api/projects/${projectId}`, (route) => route.fulfill({ json: { files: [] } }));
  await page.route("**/api/generate", (route) => route.fulfill({ contentType: "text/event-stream", body: `event: complete\ndata: ${JSON.stringify({ mode: "create", projectId, version: 1, projectName: "预览恢复契约", summary: "首版", model: "UI契约样本", buildAttempts: 1, previewUrl: `${new URL(page.url()).origin}/ui-preview`, generatedFiles: [], changedFiles: [], deletedFiles: [] })}\n\n` }));
  await page.goto("/"); await page.locator("#hero-requirement").fill("预览恢复契约");
  await page.getByRole("button", { name: /^开始/ }).click();
  await expect(page.getByTestId("generated-preview")).toBeVisible();
  active = false;
  await page.evaluate(() => { dispatchEvent(new Event("focus")); dispatchEvent(new Event("focus")); });
  await expect.poll(() => resumes, { timeout: 3000 }).toBe(1);
  await expect(page.getByRole("heading", { name: "正在恢复预览", exact: true })).toBeVisible();
  await page.locator("#workspace-requirement").fill("继续修改"); await page.locator("#workspace-requirement").press("Enter");
  await expect(page.locator(".conversation-turn")).toHaveCount(1);
  release();
  await expect(page.getByTestId("generated-preview")).toHaveAttribute("data-project-id", projectId);
  await expect(page.getByTestId("generated-preview")).toHaveAttribute("data-version", "1");
  await page.frameLocator('[data-testid="generated-preview"]').getByRole("button", { name: "测试按钮" }).click();
  await expect(page.frameLocator('[data-testid="generated-preview"]').getByRole("button", { name: "已点击" })).toBeVisible();
  expect(resumes).toBe(1);
});

test("其他标签保存新版本后，返回焦点同步源码、对话及同项目预览", async ({ page }) => {
  const projectId = "123e4567-e89b-42d3-a456-426614174000";
  let version = 1;
  const previewUrl = "http://127.0.0.1:3010/ui-latest-preview";
  await page.route("**/ui-latest-preview", (route) => route.fulfill({ contentType: "text/html; charset=utf-8", body: "<h1>新版本应用</h1>" }));
  await page.route(`**/api/projects/${projectId}/preview-status`, (route) => route.fulfill({ json: { active: true, currentVersion: version, expiresAt: Date.now() + 900000 } }));
  await page.route(`**/api/projects/${projectId}/resume`, (route) => route.fulfill({ json: {
    projectId, projectName: "同步验收", summary: "新版本", currentVersion: 2, previewUrl,
    files: [{ path: "src/App.tsx", content: "最新源码标记" }], messages: [],
    turns: [{ id: "saved-turn", mode: "modify", requirement: "另一个标签的修改", status: "completed", version: 2, summary: "新版本", events: [] }],
  } }));
  await page.route(`**/api/projects/${projectId}`, (route) => route.fulfill({ json: { files: [] } }));
  await page.route("**/api/generate", (route) => route.fulfill({ contentType: "text/event-stream", body: `event: complete\ndata: ${JSON.stringify({ mode: "create", projectId, version: 1, projectName: "同步验收", summary: "首版", previewUrl, generatedFiles: [], changedFiles: [], deletedFiles: [] })}\n\n` }));
  await page.goto("/"); await page.locator("#hero-requirement").fill("同步验收应用");
  await page.getByRole("button", { name: /^开始/ }).click();
  await expect(page.getByTestId("generated-preview")).toHaveAttribute("data-version", "1");
  version = 2; await page.evaluate(() => dispatchEvent(new Event("focus")));
  await expect(page.getByTestId("generated-preview")).toHaveAttribute("data-version", "2", { timeout: 3000 });
  await expect(page.getByTestId("generated-preview")).toHaveAttribute("data-project-id", projectId);
  await expect(page.locator(".user-bubble")).toContainText("另一个标签的修改");
  await page.getByRole("tab", { name: "代码", exact: true }).click();
  await expect(page.locator(".code-viewer pre")).toContainText("最新源码标记");
});

test("恢复失败显示真实错误并提供足够触控尺寸的重试入口", async ({ page }) => {
  const projectId = "123e4567-e89b-42d3-a456-426614174000";
  let active = false; let failed = true;
  await page.route(`**/api/projects/${projectId}/preview-status`, (route) => route.fulfill({ json: { active, currentVersion: 1, expiresAt: null } }));
  await page.route(`**/api/projects/${projectId}/resume`, (route) => {
    if (failed) return route.fulfill({ status: 500, json: { error: "恢复构建验收失败" } });
    active = true;
    return route.fulfill({ json: { projectId, currentVersion: 1, previewUrl: "about:blank" } });
  });
  await page.route(`**/api/projects/${projectId}`, (route) => route.fulfill({ json: { files: [] } }));
  await page.route("**/api/generate", (route) => route.fulfill({ contentType: "text/event-stream", body: `event: complete\ndata: ${JSON.stringify({ mode: "create", projectId, version: 1, projectName: "恢复错误验收", summary: "首版", previewUrl: "about:blank", generatedFiles: [], changedFiles: [], deletedFiles: [] })}\n\n` }));
  await page.goto("/"); await page.locator("#hero-requirement").fill("恢复错误验收");
  await page.getByRole("button", { name: /^开始/ }).click();
  await expect(page.getByRole("heading", { name: "预览暂时不可用" })).toBeVisible();
  await expect(page.locator(".viewer-empty")).toContainText("恢复构建验收失败");
  const retry = page.getByRole("button", { name: "重试预览" });
  expect((await retry.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  failed = false; await retry.click();
  await expect(page.getByTestId("generated-preview")).toHaveAttribute("data-project-id", projectId);
  await expect(page.getByRole("heading", { name: "预览暂时不可用" })).toHaveCount(0);
});
