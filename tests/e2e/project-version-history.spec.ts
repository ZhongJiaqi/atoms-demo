import { expect, test } from "@playwright/test";

// 仅验证版本列表 UI 与 API 契约；不作为真实 Auth/RLS/数据库验收。
test("工作区历史项目 UI 在同项目下展示 v2 和 v1（接口契约样本）", async ({ page }) => {
  const errors: string[] = [];
  const failures: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  page.on("response", (response) => { if (response.status() >= 400) failures.push(`${response.status()} ${response.url()}`); });
  await page.route("**/api/projects", (route) => route.fulfill({
    json: { projects: [{ id: "123e4567-e89b-42d3-a456-426614174000", name: "个人主页生成器", summary: "增加深色模式", current_version: 2, updated_at: "2026-10-14T00:01:00Z", versions: [
      { version: 2, name: "个人主页生成器", summary: "增加深色模式", created_at: "2026-10-14T00:01:00Z" },
      { version: 1, name: "个人主页生成器", summary: "创建个人主页", created_at: "2026-10-14T00:00:00Z" },
    ] }] },
  }));
  const projectId = "123e4567-e89b-42d3-a456-426614174000";
  await page.route(`**/api/projects/${projectId}`, (route) => route.fulfill({ json: { files: [] } }));
  await page.route("**/api/generate", (route) => route.fulfill({
    contentType: "text/event-stream",
    body: `event: complete\ndata: ${JSON.stringify({ mode: "create", projectId, version: 2, projectName: "个人主页生成器", summary: "增加深色模式", model: "UI契约样本", buildAttempts: 1, previewUrl: "about:blank", generatedFiles: [], changedFiles: [], deletedFiles: [] })}\n\n`,
  }));
  await page.goto("/");
  await page.locator("#hero-requirement").fill("UI契约测试");
  await page.getByRole("button", { name: /^开始/ }).click();
  await page.getByRole("button", { name: "历史项目", exact: true }).click();
  const history = page.getByRole("complementary", { name: "历史项目", exact: true });
  await expect(history.getByTestId("project-version")).toHaveCount(2, { timeout: 3000 });
  await expect(history.getByTestId("project-version").nth(0)).toContainText("v2");
  await expect(history.getByTestId("project-version").nth(0)).toContainText("当前版本");
  await expect(history.getByTestId("project-version").nth(1)).toContainText("v1");
  await expect(history.getByTestId("project-version").nth(1)).toContainText("创建个人主页");
  await expect(history.locator('a[href="/?project=123e4567-e89b-42d3-a456-426614174000"]')).toHaveCount(1);
  expect(errors).toEqual([]);
  expect(failures).toEqual([]);
});
