import { expect, test } from "@playwright/test";

// 宿主 UI 契约样本：代码已真实保存但地址未就绪时不应崩溃或谎称构建失败。
test("已保存版本缺少预览地址时保留项目、代码入口和真实错误反馈", async ({ page }) => {
  const errors: string[] = [], failures: number[] = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
  page.on("response", r => { if (r.status() >= 400) failures.push(r.status()); });
  const projectId = "123e4567-e89b-42d3-a456-426614174000";
  await page.route(`**/api/projects/${projectId}/preview-status`, r => r.fulfill({ json: { active: true, cloud: true, expiresAt: null, currentVersion: 1 } }));
  await page.route(`**/api/projects/${projectId}`, r => r.fulfill({ json: { files: [{ path: "src/App.tsx", content: "// 已保存的契约样本源码" }] } }));
  await page.route(`**/api/projects/${projectId}/resume`, r => r.fulfill({ json: { projectId, currentVersion: 1, previewReady: false, previewError: "预览域名尚未配置" } }));
  await page.route("**/api/generate", r => r.fulfill({ contentType: "text/event-stream", body: `event: complete\ndata: ${JSON.stringify({ mode: "create", projectId, version: 1, projectName: "已保存项目", summary: "完成首版", previewReady: false, previewError: "预览域名尚未配置", model: "UI契约样本", buildAttempts: 1, generatedFiles: ["src/App.tsx"], changedFiles: [], deletedFiles: [] })}\n\n` }));
  await page.goto("/");
  await page.locator("#hero-requirement").fill("保存后预览状态契约测试");
  await page.getByRole("button", { name: /^开始/ }).click();
  await expect(page.locator(".session-status")).toContainText("已保存", { timeout: 3000 });
  await expect(page.locator(".preview-canvas")).toContainText("预览域名尚未配置");
  await expect(page.getByRole("button", { name: "重试预览" })).toBeVisible();
  await expect(page.getByRole("link", { name: "在新标签页打开" })).toHaveCount(0);
  await expect(page.getByTestId("generated-preview")).toHaveCount(0);
  await page.getByRole("tab", { name: "代码", exact: true }).click();
  await expect(page.locator(".code-viewer")).toContainText("已保存的契约样本源码");
  await expect(page.getByRole("button", { name: "发送修改需求" })).toBeVisible();
  expect(errors).toEqual([]); expect(failures).toEqual([]);
});
