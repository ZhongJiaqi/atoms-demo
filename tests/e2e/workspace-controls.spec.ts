import { expect, test, type Page } from "@playwright/test";

// 仅验证宿主真实 UI 行为；API 使用明确契约样本，不代表数据库、模型或沙盒验收。
const projectId = "123e4567-e89b-42d3-a456-426614174000";
const summary = "已创建任务列表，可继续添加优先级。";

async function openWorkspace(page: Page) {
  await page.route(`**/api/projects/${projectId}/preview-status`, (route) => route.fulfill({ json: { active: true, expiresAt: Date.now() + 900000, currentVersion: 1 } }));
  await page.route("**/api/projects", (route) => route.fulfill({ json: { projects: [{ id: projectId, name: "控件验收", summary, current_version: 1, updated_at: "2026-10-14T00:00:00Z", versions: [{ version: 1, name: "控件验收", summary, created_at: "2026-10-14T00:00:00Z" }] }] } }));
  await page.route(`**/api/projects/${projectId}`, (route) => route.fulfill({ json: { files: [{ path: "src/App.tsx", content: "// UI 契约样本" }] } }));
  await page.route("**/api/generate", (route) => route.fulfill({ contentType: "text/event-stream", body: [
    ["build_started", { message: "执行生产构建检查" }],
    ["complete", { mode: "create", projectId, version: 1, projectName: "控件验收", summary, model: "UI契约样本", buildAttempts: 1, previewUrl: "about:blank", generatedFiles: [], changedFiles: [], deletedFiles: [] }],
  ].map(([event, data]) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`).join("") }));
  await page.goto("/");
  await page.locator("#hero-requirement").fill("工作区UI契约验收");
  await page.getByRole("button", { name: /^开始/ }).click();
  await expect(page.locator(".conversation-turn[data-status=completed]")).toBeVisible();
}

test("工作区以可访问SVG控件替代无功能符号并可查看版本记录", async ({ page }) => {
  await openWorkspace(page);
  await expect(page.locator(".message-actions span").filter({ hasText: /[▢♧♤]|···/ })).toHaveCount(0);
  for (const name of ["新建项目", "历史项目", "项目文件", "退出登录", "刷新预览", "桌面预览", "手机预览"]) {
    await expect(page.getByRole("button", { name, exact: true }).locator("svg")).toHaveCount(1);
  }
  await expect(page.locator(".chat-header")).not.toContainText("⌄");
  await expect(page.locator(".route-select")).not.toContainText("⌄");
  await page.getByRole("button", { name: "查看版本记录", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "历史记录", exact: true })).toBeVisible();
});

test("复制Agent回复写入真实剪贴板并在权限失败时提供反馈", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await openWorkspace(page);
  await page.getByRole("button", { name: "复制回复", exact: true }).click();
  await expect(page.locator(".message-actions").getByRole("status")).toHaveText("已复制回复");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(summary);
  await page.evaluate(() => {
    Object.defineProperty(navigator.clipboard, "writeText", { configurable: true, value: async () => { throw new DOMException("Denied", "NotAllowedError"); } });
  });
  await page.getByRole("button", { name: "复制回复", exact: true }).click();
  await expect(page.locator(".message-actions").getByRole("status")).toHaveText(/复制失败/);
});

test("执行日志展示本轮真实事件而不声称预览进程持续运行", async ({ page }) => {
  const errors: string[] = []; const failures: number[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  page.on("response", (response) => { if (response.status() >= 400) failures.push(response.status()); });
  await openWorkspace(page);
  await page.getByRole("button", { name: "执行日志", exact: true }).click();
  await expect(page.locator(".console-drawer")).toContainText("执行生产构建检查");
  await expect(page.locator(".console-drawer")).toContainText("运行代码检查与生产构建");
  await expect(page.locator(".console-drawer")).not.toContainText("预览进程运行中");
  await page.getByRole("button", { name: "关闭执行日志", exact: true }).click();
  await expect(page.locator(".console-drawer")).toHaveCount(0);
  expect(errors).toEqual([]); expect(failures).toEqual([]);
});

test("手机从预览打开历史项目时切回可见对话区域", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await openWorkspace(page);
  await page.getByRole("navigation", { name: "工作区视图" }).getByRole("button", { name: "预览", exact: true }).click();
  await page.getByRole("button", { name: "历史项目", exact: true }).click();
  await expect(page.locator(".project-history")).toBeVisible();
  await expect(page.locator(".project-history")).toContainText("控件验收");
});

test("任务进行中显示只读执行状态而无假停止按钮", async ({ page }) => {
  await page.route("**/api/generate", () => {});
  await page.goto("/");
  await page.locator("#hero-requirement").fill("工作区运行状态验收");
  await page.getByRole("button", { name: /^开始/ }).click();
  await expect(page.locator(".chat-composer").getByRole("status")).toHaveText("正在执行");
  await expect(page.getByRole("button", { name: "任务运行中", exact: true })).toHaveCount(0);
});
