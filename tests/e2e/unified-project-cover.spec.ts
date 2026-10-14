import { expect, test } from "@playwright/test";

const proxy = process.env.https_proxy || process.env.HTTPS_PROXY;
test.use({ trace: "off", screenshot: "off", actionTimeout: 15000,
  ...(proxy ? { proxy: { server: proxy, bypass: "127.0.0.1,localhost" } } : {}),
});

// 真实登录及宿主页面；项目列表为明确的非 AI UI 契约样本。
// 若重新加入封面 img/截图请求，或改变卡片的项目导航，本测试必须失败。
const projects = [
  { id: "123e4567-e89b-42d3-a456-426614174001", name: "项目看板", summary: "不在卡片展示的详细描述", current_version: 2, updated_at: "2026-10-14T07:00:00Z" },
  { id: "123e4567-e89b-42d3-a456-426614174002", name: "支持编辑与自动保存的个人主页生成器", summary: "另一份详细描述", current_version: 1, updated_at: "2026-10-14T06:00:00Z" },
];

for (const width of [1470, 320]) {
  test(`统一封面 ${width}px 无截图网络依赖且保留项目导航`, async ({ page }) => {
    test.skip(!process.env.E2E_PRIMARY_EMAIL || !process.env.E2E_PRIMARY_PASSWORD, "需要临时真实测试账号");
    const errors: number[] = [], failures: number[] = [], thumbnails: string[] = [];
    page.on("pageerror", () => errors.push(1));
    page.on("console", message => { if (message.type() === "error") errors.push(1); });
    page.on("response", response => { if (response.status() >= 400) failures.push(response.status()); });
    await page.route("**/api/projects", route => route.fulfill({ json: { projects } }));
    await page.route("**/api/projects/*/thumbnail?*", route => {
      thumbnails.push(new URL(route.request().url()).pathname);
      return route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="960" height="600"/>' });
    });
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/login");
    await page.getByLabel("邮箱", { exact: true }).fill(process.env.E2E_PRIMARY_EMAIL!);
    await page.getByLabel("密码", { exact: true }).fill(process.env.E2E_PRIMARY_PASSWORD!);
    await page.getByRole("button", { name: "登录", exact: true }).click();
    await page.waitForURL(url => url.pathname === "/");
    const cards = page.locator(".home-project-card");
    await expect(cards).toHaveCount(2);
    await cards.first().scrollIntoViewIfNeeded();
    await expect(page.getByRole("img", { name: "统一项目封面", exact: true })).toHaveCount(2);
    await expect(cards.locator("img")).toHaveCount(0);
    for (let index = 0; index < projects.length; index++) {
      const card = cards.nth(index);
      await expect(card).toHaveAttribute("href", `/?project=${projects[index].id}`);
      await expect(card.locator("h3")).toHaveText(projects[index].name);
      await expect(card.locator("small")).toContainText("最近更新");
      await expect(card.locator("p")).toHaveCount(0);
      await card.focus();
      await expect(card).toBeFocused();
      const box = (await card.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(width + 1);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.reload();
    await expect(cards).toHaveCount(2);
    await cards.last().scrollIntoViewIfNeeded();
    await expect(page.getByRole("img", { name: "统一项目封面", exact: true })).toHaveCount(2);
    expect(thumbnails).toEqual([]);
    expect(errors).toEqual([]);
    expect(failures).toEqual([]);
    await cards.first().evaluate(element => element.scrollIntoView({ block: "center", behavior: "instant" }));
    await expect.poll(() => cards.first().evaluate(element => {
      const rect = element.getBoundingClientRect();
      return rect.top >= 0 && rect.bottom <= innerHeight && element.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2));
    }), { timeout: 3000 }).toBe(true);
    await cards.first().screenshot({ path: `/private/tmp/atoms-unified-cover-${width}.png`, animations: "disabled" });
  });
}
