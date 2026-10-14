import { expect, test } from "@playwright/test";

// UI 契约样本：验证真实组件布局，不冒充数据库或模型验收。
test("历史面板长摘要不挤压标题、恢复按钮或手机布局", async ({ page }, testInfo) => {
  const errors: string[] = [], failures: number[] = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
  page.on("response", r => { if (r.status() >= 400) failures.push(r.status()); });
  const projectId = "123e4567-e89b-42d3-a456-426614174000";
  const summary = "支持创建和删除习惯、每日打卡与取消、今日进度与连续天数，并通过 localStorage 持久化。".repeat(6);
  await page.route(`**/api/projects/${projectId}/preview-status`, r => r.fulfill({ json: { active: true, expiresAt: Date.now() + 900000, currentVersion: 2 } }));
  await page.route(`**/api/projects/${projectId}`, r => r.fulfill({ json: { files: [] } }));
  await page.route("**/api/projects", r => r.fulfill({ json: { projects: [{ id: projectId, name: "习惯打卡", current_version: 2, versions: [2, 1].map(version => ({ version, name: "习惯打卡", summary, created_at: "2026-10-14T03:31:55Z" })) }] } }));
  await page.route("**/api/generate", r => r.fulfill({ contentType: "text/event-stream", body: `event: complete\ndata: ${JSON.stringify({ mode: "create", projectId, version: 2, projectName: "习惯打卡", summary, model: "UI契约样本", buildAttempts: 1, previewUrl: "about:blank", generatedFiles: [], changedFiles: [], deletedFiles: [] })}\n\n` }));
  await page.goto("/");
  await page.locator("#hero-requirement").fill("历史面板UI验收");
  await page.getByRole("button", { name: /^开始/ }).click();
  for (const width of [1440, 375, 320]) {
    await page.setViewportSize({ width, height: 812 });
    await page.getByRole("button", { name: "历史记录", exact: true }).click();
    const panel = page.getByRole("dialog", { name: "历史记录", exact: true });
    await expect(panel.getByRole("heading", { name: "习惯打卡", exact: true })).toHaveCount(2);
    await expect(panel).toContainText("2 个版本");
    const badge = panel.getByText("v1", { exact: true });
    await expect(badge).toHaveCount(1);
    const badgeBox = (await badge.boundingBox())!;
    expect(badgeBox.width).toBeLessThanOrEqual(40);
    expect(badgeBox.height).toBeLessThanOrEqual(28);
    const card = panel.locator(".history-version-card").first();
    expect((await card.boundingBox())!.height).toBeLessThanOrEqual(220);
    const restore = panel.getByRole("button", { name: "恢复到版本 v1" });
    const box = (await restore.boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.x + box.width).toBeLessThanOrEqual(width);
    expect(await panel.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`history-${width}.png`), animations: "disabled" });
    await page.keyboard.press("Escape");
    await expect(panel).toHaveCount(0);
  }
  expect(errors).toEqual([]); expect(failures).toEqual([]);
});
