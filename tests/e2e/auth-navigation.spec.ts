import { expect, test } from "@playwright/test";

test("退出接口返回JSON而不是重定向到服务器监听地址", async ({ request }) => {
  const response = await request.post("/auth/logout", { maxRedirects: 0 });
  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({ signedOut: true });
  expect(response.headers()["location"]).toBeUndefined();
});

test("首页移除查看历史项目，未登录访问受保护项目保留返回地址", async ({ page }) => {
  const errors: string[] = [];
  const failures: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  page.on("response", (response) => { if (response.status() >= 400) failures.push(`${response.status()} ${response.url()}`); });
  await page.goto("/");
  await expect(page.getByRole("button", { name: "历史项目", exact: true })).toHaveCount(0);
  await page.goto("/?project=00000000-0000-4000-8000-000000000001");
  await expect(page).toHaveURL(/\/login\?next=/);
  expect(new URL(page.url()).searchParams.get("next")).toBe("/?project=00000000-0000-4000-8000-000000000001");
  await expect(page.getByLabel("邮箱")).toBeVisible();
  expect(errors).toEqual([]);
  expect(failures).toEqual([]);
});

test("窄屏首页显示项目区域且不显示查看历史项目", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/");
  await expect(page.getByRole("region", { name: "我的项目", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "历史项目", exact: true })).toHaveCount(0);
});

test("首页我的项目区域位于需求对话框下方", async ({ page }) => {
  await page.goto("/");
  const section = page.getByRole("region", { name: "我的项目", exact: true });
  await expect(section).toBeVisible({ timeout: 3000 });
  const composer = await page.locator(".hero-composer").boundingBox();
  const projects = await section.boundingBox();
  expect(composer).not.toBeNull(); expect(projects).not.toBeNull();
  expect(projects!.y).toBeGreaterThanOrEqual(composer!.y + composer!.height);
  await expect(section).toContainText("登录后");
});
