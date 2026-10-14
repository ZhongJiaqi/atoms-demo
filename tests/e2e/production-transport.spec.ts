import { expect, test } from "@playwright/test";

test("正式站 API 测试通道能收到真实未登录拒绝", async ({ page }) => {
  test.skip(process.env.ATOMS_E2E_BASE_URL !== "https://atoms-demo-jiaqi.vercel.app", "仅验收正式站测试连接，不调用模型。");
  const response = await page.request.get("/api/projects/00000000-0000-4000-8000-000000000000", {
    timeout: 10_000,
    maxRedirects: 0,
  });
  expect(response.status()).toBe(401);
});
