import { expect, test } from "@playwright/test";

test("首页需求示例点击填入完整文本、允许切换编辑且不自动生成", async ({ page }, testInfo) => {
  const errors: string[] = []; const failures: number[] = []; let generations = 0;
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  page.on("response", (response) => { if (response.status() >= 400) failures.push(response.status()); });
  page.on("request", (request) => { if (new URL(request.url()).pathname === "/api/generate") generations++; });
  await page.goto("/");
  const examples = page.getByRole("group", { name: "需求描述示例" });
  const input = page.getByLabel("描述你想创建的应用");
  const cases = [
    ["项目看板", "做一个项目看板：支持添加、编辑和删除任务，设置高、中、低优先级和截止日期，在待办、进行中、已完成之间移动任务，逾期任务高亮，刷新后保留数据。"],
    ["个人记账", "做一个个人记账应用：录入收入和支出，填写金额、分类、日期和备注，展示本月收支汇总，支持按分类筛选和删除记录，刷新后保留数据。"],
    ["个人主页", "做一个可在线编辑的个人主页：展示姓名、简介、技能标签、项目经历和联系方式，支持预览和编辑切换、深色模式，修改后自动保存，刷新后保留数据。"],
    ["习惯打卡", "做一个习惯打卡应用：创建和删除习惯，支持每日打卡与取消打卡，展示今日完成进度和连续打卡天数，刷新后保留习惯和打卡记录。"],
  ];
  for (const size of [{ width: 1440, height: 900 }, { width: 375, height: 812 }, { width: 320, height: 640 }]) {
    await page.setViewportSize(size);
    for (const [label, text] of cases) {
      const button = examples.getByRole("button", { name: label, exact: true });
      await button.click();
      await expect(input).toHaveValue(text);
      await expect(input).toBeFocused();
      await expect(button).toHaveAttribute("aria-pressed", "true");
      expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      await expect(page.getByRole("button", { name: /^开始/ })).toBeEnabled();
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`home-examples-${size.width}.png`), animations: "disabled" });
  }
  await input.fill("我自己编辑的需求描述");
  await expect(examples.locator('button[aria-pressed="true"]')).toHaveCount(0);
  await expect(page.locator(".workspace-shell")).toHaveCount(0);
  expect(generations).toBe(0); expect(errors).toEqual([]); expect(failures).toEqual([]);
});
