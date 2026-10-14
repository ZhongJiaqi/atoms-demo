import { expect, test, type Page } from "@playwright/test";

test.use({ actionTimeout: 30_000 });

const REQUIRED_ENV = ["E2E_PRIMARY_EMAIL", "E2E_PRIMARY_PASSWORD", "E2E_OTHER_EMAIL", "E2E_OTHER_PASSWORD"] as const;
const missingEnvironment = REQUIRED_ENV.filter((name) => !process.env[name]);
const GENERATION_TIMEOUT = 6 * 60 * 1000;

async function login(page: Page, email: string, password: string, next = "/") {
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await page.getByLabel("邮箱").fill(email);
  await page.getByLabel("密码").fill(password);
  await page.getByRole("button", { name: "登录", exact: true }).last().click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
}

async function logout(page: Page) {
  const button = page.getByRole("button", { name: "退出登录" });
  if (await button.count()) {
    await button.click();
    await page.waitForURL("/");
  } else {
    await page.request.post("/auth/logout");
    await page.goto("/");
  }
}

async function modify(page: Page, requirement: string, version: number) {
  await page.locator("#workspace-requirement").fill(requirement);
  await page.getByRole("button", { name: "发送修改需求" }).click();
  await expect(page.getByTestId("generated-preview")).toHaveAttribute("data-version", String(version), {
    timeout: GENERATION_TIMEOUT,
  });
  await expect(page.locator(".session-status")).toContainText("已保存");
}

test.describe("Phase 2 真实认证、持久化与恢复", () => {
  test.skip(process.env.E2E_REAL_MODEL !== "1", "需要显式设置 E2E_REAL_MODEL=1 才调用真实模型。");
  test.skip(missingEnvironment.length > 0, `缺少真实测试账号环境变量：${missingEnvironment.join(", ")}`);

  test("注册入口调用真实 Supabase Auth", async ({ page }) => {
    test.skip(!process.env.E2E_SIGNUP_EMAIL || !process.env.E2E_SIGNUP_PASSWORD, "需要一次性 E2E_SIGNUP_EMAIL/E2E_SIGNUP_PASSWORD。");
    await page.goto("/login?mode=register");
    await page.getByLabel("邮箱").fill(process.env.E2E_SIGNUP_EMAIL!);
    await page.getByLabel("密码").fill(process.env.E2E_SIGNUP_PASSWORD!);
    await page.getByRole("button", { name: "注册", exact: true }).last().click();
    await expect(page.locator("body")).toContainText(/注册成功|正在恢复|把想法变成/);
  });

  test("Todo 创建、两轮修改、刷新重登、Sandbox 恢复及跨账号隔离", async ({ page }) => {
    const primaryEmail = process.env.E2E_PRIMARY_EMAIL!;
    const primaryPassword = process.env.E2E_PRIMARY_PASSWORD!;
    const otherEmail = process.env.E2E_OTHER_EMAIL!;
    const otherPassword = process.env.E2E_OTHER_PASSWORD!;
    const consoleErrors: string[] = [];
    const failedResponses: string[] = [];
    let testingIsolation = false;
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    page.on("pageerror", (error) => consoleErrors.push(error.message));
    page.on("response", (response) => {
      const expectedIsolationDenial = testingIsolation && [403, 404].includes(response.status()) &&
        (response.url().endsWith("/api/generate") || /\/api\/projects\/[0-9a-f-]{36}$/.test(response.url()));
      if (response.status() >= 400 && !expectedIsolationDenial) {
        failedResponses.push(`${response.status()} ${response.url()}`);
      }
    });

    await login(page, primaryEmail, primaryPassword);
    await page.locator("#hero-requirement").fill(
      "创建 Todo App，支持添加、完成和删除任务；使用 localStorage 保证刷新后任务不丢失。提供 data-testid：task-input、add-task、task-item。",
    );
    await page.getByRole("button", { name: /^开始/ }).click();
    const preview = page.getByTestId("generated-preview");
    await expect(preview).toHaveAttribute("data-version", "1", { timeout: GENERATION_TIMEOUT });
    const projectId = await preview.getAttribute("data-project-id");
    expect(projectId).toMatch(/^[0-9a-f-]{36}$/i);
    if (!projectId) throw new Error("缺少项目 ID");

    let frame = page.frameLocator('[data-testid="generated-preview"]');
    await frame.getByTestId("task-input").fill("验证数据库恢复");
    await frame.getByTestId("add-task").click();
    await expect(frame.getByTestId("task-item").filter({ hasText: "验证数据库恢复" })).toBeVisible();
    await page.getByRole("button", { name: "刷新预览" }).click();
    await expect(frame.getByTestId("task-item").filter({ hasText: "验证数据库恢复" })).toBeVisible();

    await modify(page, "增加深色模式，并保留已有功能和数据", 2);
    await page.reload({ waitUntil: "networkidle" });
    await expect(page.getByTestId("generated-preview")).toHaveAttribute("data-project-id", projectId);
    await expect(page.getByTestId("generated-preview")).toHaveAttribute("data-version", "2");
    await expect(page.locator(".conversation-turn")).toHaveCount(2);
    frame = page.frameLocator('[data-testid="generated-preview"]');
    await expect(frame.getByTestId("task-item").filter({ hasText: "验证数据库恢复" })).toBeVisible();

    await logout(page);
    await login(page, primaryEmail, primaryPassword);
    await page.locator(`.home-projects a[href="/?project=${projectId}"]`).click();
    await expect(page.getByTestId("generated-preview")).toHaveAttribute("data-project-id", projectId);

    await logout(page);
    await login(page, otherEmail, otherPassword);
    testingIsolation = true;
    const foreignRead = await page.request.get(`/api/projects/${projectId}`);
    expect([403, 404]).toContain(foreignRead.status());
    const foreignModify = await page.request.post("/api/generate", {
      data: { projectId, requirement: "不能修改别人的项目" },
    });
    expect([403, 404]).toContain(foreignModify.status());
    testingIsolation = false;

    await logout(page);
    await login(page, primaryEmail, primaryPassword, `/?project=${projectId}`);
    await expect(page.getByTestId("generated-preview")).toHaveAttribute("data-version", "2", { timeout: GENERATION_TIMEOUT });
    await modify(page, "增加任务优先级，支持高、中、低三级，并保留已有任务和深色模式", 3);
    await expect(page.getByTestId("generated-preview")).toHaveAttribute("data-project-id", projectId);
    await expect(page.locator(".conversation-turn")).toHaveCount(3);

    expect(consoleErrors, consoleErrors.join("\n")).toEqual([]);
    expect(failedResponses, failedResponses.join("\n")).toEqual([]);
  });
});
