import { expect, test, type Page } from "@playwright/test";
import { expenseTotal } from "../utils/representative-locators";

test.use({ actionTimeout: 1_000, trace: "off", screenshot: "off" });

async function fixture(page: Page, html: string) {
  await page.setContent("<iframe title='静态记账测试'></iframe>");
  await page.locator("iframe").evaluate((frame, content) => new Promise<void>(resolve => {
    frame.addEventListener("load", () => resolve(), { once: true });
    (frame as HTMLIFrameElement).srcdoc = content;
  }), html);
  return page.frameLocator("iframe");
}

test("存在expense-total时优先测试ID而非同页总支出标签", async ({ page }) => {
  const frame = await fixture(page, '<section><span>总支出</span><strong>¥0.00</strong></section><output data-testid="expense-total">¥88.50</output>');
  await expect(await expenseTotal(frame)).toHaveText("¥88.50", { timeout: 1_000 });
});

test("缺少测试ID时按精确总支出标签的父元素检查真实金额", async ({ page }) => {
  const frame = await fixture(page, '<section><span>总支出</span><strong>¥88.50</strong></section><p>历史总支出：¥999.00</p>');
  await expect(await expenseTotal(frame)).toHaveText("总支出¥88.50", { timeout: 1_000 });
});

test("总支出金额错误即使其他区域出现正确数值仍拒绝", async ({ page }) => {
  const frame = await fixture(page, '<section><span>总支出</span><strong>¥99.00</strong></section><p>单笔记录：¥88.50</p>');
  const total = await expenseTotal(frame);
  await expect(total).toHaveText("总支出¥99.00", { timeout: 1_000 });
  await expect(expect(total).toContainText(/88[.,]50|88\.5/, { timeout: 300 })).rejects.toThrow();
});

test("总支出标签重复时严格拒绝歧义，不选第一项", async ({ page }) => {
  const frame = await fixture(page, '<section><span>总支出</span><strong>¥88.50</strong></section><section><span>总支出</span><strong>¥99.00</strong></section>');
  await expect(expenseTotal(frame).then(total => expect(total).toContainText(/88[.,]50|88\.5/, { timeout: 300 }))).rejects.toThrow(/strict mode violation/);
});

test("总支出标签父元素是body时拒绝读取其他区域金额", async ({ page }) => {
  const frame = await fixture(page, '<span>总支出</span><strong>¥99.00</strong><p>单笔记录：¥88.50</p>');
  await expect(expenseTotal(frame)).rejects.toThrow(/父元素/);
});

test("同一父元素里重复总支出标签也严格拒绝", async ({ page }) => {
  const frame = await fixture(page, '<section><span>总支出</span><strong>¥88.50</strong><span>总支出</span><strong>¥99.00</strong></section>');
  await expect(expenseTotal(frame).then(total => expect(total).toContainText(/88[.,]50|88\.5/, { timeout: 300 }))).rejects.toThrow(/strict mode violation/);
});
