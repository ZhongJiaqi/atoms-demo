import { expect, test } from "@playwright/test";

test("浏览器认证客户端读取公开配置并向真实 Supabase 发送登录请求", async ({ page }) => {
  const projectUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  test.skip(!projectUrl, "需要本项目的真实 Supabase 配置。");
  const tokenUrl = new URL("/auth/v1/token", projectUrl!).toString();
  const errors: string[] = [];
  const failures: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    // 无效凭据的真实 400 是本用例预期的认证拒绝。
    if (message.type() === "error" && !message.text().includes("400")) errors.push(message.text());
  });
  page.on("response", (response) => {
    if (response.status() >= 400 && !(response.status() === 400 && response.url().startsWith(tokenUrl))) {
      failures.push(`${response.status()} ${response.url()}`);
    }
  });
  await page.goto("/login");
  await page.getByLabel("邮箱").fill(`atoms-config-check-${Date.now()}@example.invalid`);
  await page.getByLabel("密码").fill("InvalidCredentials-ConfigCheck");
  const responsePromise = page.waitForResponse(
    (response) => response.url().startsWith(tokenUrl) && response.request().method() === "POST",
    { timeout: 10000 },
  );
  await page.getByRole("button", { name: "登录", exact: true }).click();
  const response = await responsePromise;
  expect(response.status()).toBe(400);
  const body = await response.json();
  expect(body.code).toBe("invalid_credentials");
  await expect(page.getByRole("status")).toContainText("Invalid login credentials");
  await expect(page.getByRole("status")).not.toContainText("缺少 NEXT_PUBLIC");
  expect(errors).toEqual([]);
  expect(failures).toEqual([]);
});
