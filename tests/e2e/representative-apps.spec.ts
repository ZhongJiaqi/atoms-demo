import { expect, test, type FrameLocator, type Locator, type Page, type TestInfo } from "@playwright/test";
import { expenseTotal } from "../utils/representative-locators";

test.use({ actionTimeout: 30_000, trace: "off", screenshot: "off" });

const GENERATION_TIMEOUT = 6 * 60 * 1000;

async function deleteRecord(frame: FrameLocator, item: Locator) {
  await item.getByRole("button", { name: /删除/ }).click();
  const confirmation = frame.getByRole("dialog").or(frame.getByRole("alertdialog"));
  await expect.poll(async () => (await item.count()) === 0 || await confirmation.isVisible()).toBe(true);
  if (await confirmation.isVisible()) {
    await confirmation.getByRole("button", { name: /确认|确定|^删除$/ }).click();
  }
  await expect(item).toHaveCount(0);
}

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("邮箱").fill(process.env.E2E_PRIMARY_EMAIL!);
  await page.getByLabel("密码").fill(process.env.E2E_PRIMARY_PASSWORD!);
  await page.getByRole("button", { name: "登录", exact: true }).last().click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
}

type AppCase = {
  name: string;
  prompt: string;
  exercise: (frame: FrameLocator) => Promise<void>;
  verifyPersisted: (frame: FrameLocator) => Promise<void>;
};

type PersistedProject = {
  projectId: string;
  projectName: string;
  summary: string;
  currentVersion: number;
  messages: Array<{ role: "user" | "assistant"; content: string; turnId: string }>;
  turns: Array<{
    id: string;
    status: "running" | "completed" | "failed";
    version?: number;
    buildAttempts?: number;
    events: Array<{ event: string }>;
  }>;
  files: Array<{ path: string; content: string }>;
};

const appCases: AppCase[] = [
  {
    name: "任务管理：CRUD、优先级和双层持久化",
    prompt:
      "创建一个响应式任务管理应用。必须支持添加、完成、删除任务和高、中、低优先级，并在页面刷新后保留任务及完成状态。请提供 data-testid：task-input、priority-select、add-task、task-item；每个 task-item 使用 data-completed=\"true\" 或 \"false\" 表示完成状态；按钮使用清晰中文无障碍名称。",
    async exercise(frame) {
      const input = frame.getByTestId("task-input");
      const add = frame.getByTestId("add-task");
      await input.fill("准备产品演示");
      await frame.getByTestId("priority-select").selectOption("high");
      await add.click();
      const keepItem = frame.getByTestId("task-item").filter({ hasText: "准备产品演示" });
      await expect(keepItem).toBeVisible();
      await keepItem.getByRole("button", { name: /完成|状态|勾选/ }).first().click();
      await expect(keepItem).toHaveAttribute("data-completed", "true");

      await input.fill("临时任务");
      await add.click();
      const deleteItem = frame.getByTestId("task-item").filter({ hasText: "临时任务" });
      await deleteRecord(frame, deleteItem);
    },
    async verifyPersisted(frame) {
      const keepItem = frame.getByTestId("task-item").filter({ hasText: "准备产品演示" });
      await expect(keepItem).toBeVisible();
      await expect(keepItem).toHaveAttribute("data-completed", "true");
      await expect(frame.getByTestId("task-item").filter({ hasText: "临时任务" })).toHaveCount(0);
    },
  },
  {
    name: "个人记账：录入、统计、删除和双层持久化",
    prompt:
      "创建一个响应式个人记账应用。必须支持输入事项和金额、选择分类、添加与删除记录、实时计算总支出，并在页面刷新后保留账目。请提供 data-testid：expense-title、expense-amount、expense-category、add-expense、expense-item、expense-total；按钮使用清晰中文无障碍名称。",
    async exercise(frame) {
      const title = frame.getByTestId("expense-title");
      const amount = frame.getByTestId("expense-amount");
      const category = frame.getByTestId("expense-category");
      const add = frame.getByTestId("add-expense");
      await title.fill("团队午餐");
      await amount.fill("88.50");
      await category.selectOption({ index: 1 });
      await add.click();
      await expect(frame.getByTestId("expense-item").filter({ hasText: "团队午餐" })).toBeVisible();
      await expect(await expenseTotal(frame)).toContainText(/88[.,]50|88\.5/);

      await title.fill("临时支出");
      await amount.fill("12");
      await add.click();
      const deleteItem = frame.getByTestId("expense-item").filter({ hasText: "临时支出" });
      await deleteRecord(frame, deleteItem);
    },
    async verifyPersisted(frame) {
      await expect(frame.getByTestId("expense-item").filter({ hasText: "团队午餐" })).toBeVisible();
      await expect(await expenseTotal(frame)).toContainText(/88[.,]50|88\.5/);
      await expect(frame.getByTestId("expense-item").filter({ hasText: "临时支出" })).toHaveCount(0);
    },
  },
  {
    name: "习惯打卡：创建、打卡、进度、删除和双层持久化",
    prompt:
      "创建一个响应式习惯打卡应用。必须支持创建和删除习惯、当天打卡与取消打卡、显示完成进度，并在页面刷新后保留习惯和打卡状态。请提供 data-testid：habit-input、add-habit、habit-item、habit-progress；按钮使用清晰中文无障碍名称。",
    async exercise(frame) {
      const input = frame.getByTestId("habit-input");
      const add = frame.getByTestId("add-habit");
      await input.fill("阅读 30 分钟");
      await add.click();
      const keepItem = frame.getByTestId("habit-item").filter({ hasText: "阅读 30 分钟" });
      await expect(keepItem).toBeVisible();
      await keepItem.getByRole("button", { name: /打卡|完成/ }).first().click();
      const progress = frame.getByTestId("habit-progress");
      await expect(progress).toBeVisible();
      await expect.poll(async () => {
        const ownValue = await progress.getAttribute("aria-valuenow");
        const nestedBar = progress.getByRole("progressbar");
        const nestedValue = (await nestedBar.count()) ? await nestedBar.getAttribute("aria-valuenow") : null;
        const text = await progress.innerText();
        return (ownValue !== null && ownValue !== "0") ||
          (nestedValue !== null && nestedValue !== "0") ||
          /100\s*%|1\s*\/\s*1/.test(text);
      }).toBe(true);

      await input.fill("临时习惯");
      await add.click();
      const deleteItem = frame.getByTestId("habit-item").filter({ hasText: "临时习惯" });
      await deleteRecord(frame, deleteItem);
    },
    async verifyPersisted(frame) {
      await expect(frame.getByTestId("habit-item").filter({ hasText: "阅读 30 分钟" })).toBeVisible();
      const progress = frame.getByTestId("habit-progress");
      await expect(progress).toBeVisible();
      await expect.poll(async () => {
        const ownValue = await progress.getAttribute("aria-valuenow");
        const nestedBar = progress.getByRole("progressbar");
        const nestedValue = (await nestedBar.count()) ? await nestedBar.getAttribute("aria-valuenow") : null;
        const text = await progress.innerText();
        return (ownValue !== null && ownValue !== "0") ||
          (nestedValue !== null && nestedValue !== "0") ||
          /100\s*%|1\s*\/\s*1/.test(text);
      }).toBe(true);
      await expect(frame.getByTestId("habit-item").filter({ hasText: "临时习惯" })).toHaveCount(0);
    },
  },
];

async function generateAndVerifyCore(page: Page, testInfo: TestInfo, appCase: AppCase) {
  await login(page);
  await page.goto("/", { waitUntil: "networkidle" });
  await page.locator("#hero-requirement").fill(appCase.prompt);
  await page.getByRole("button", { name: /^开始/ }).click();
  await expect(page.locator(".workspace-shell")).toBeVisible();

  const preview = page.getByTestId("generated-preview");
  await expect(preview).toBeVisible({ timeout: GENERATION_TIMEOUT });
  await expect(page.locator(".version-card").first()).toBeVisible({ timeout: GENERATION_TIMEOUT });
  await expect(preview).toHaveAttribute("data-version", "1");
  const projectId = await preview.getAttribute("data-project-id");
  expect(projectId).toMatch(/^[0-9a-f-]{36}$/i);
  if (!projectId) throw new Error("生成完成后缺少项目 ID");

  const trace = await page.locator(".tool-step strong").allTextContents();
  expect(trace).toEqual(expect.arrayContaining(["分析需求并规划实现", "写入项目文件", "运行代码检查与生产构建", "准备应用预览"]));

  const projectResponse = await page.request.get(`/api/projects/${projectId}`);
  expect(projectResponse.ok()).toBeTruthy();
  const project = (await projectResponse.json()) as PersistedProject;
  expect(project.currentVersion).toBe(1);
  expect(project.files.map((file: { path: string }) => file.path)).toContain("src/App.tsx");
  expect(project.messages.map((message) => message.role)).toEqual(["user", "assistant"]);
  expect(project.messages[0]?.content).toBe(appCase.prompt);
  expect(project.messages[1]?.content.trim().length).toBeGreaterThan(0);
  expect(project.turns).toHaveLength(1);
  expect(project.turns[0]).toMatchObject({ status: "completed", version: 1 });
  expect(project.turns[0]?.buildAttempts).toBeGreaterThanOrEqual(1);
  expect(project.turns[0]?.buildAttempts).toBeLessThanOrEqual(3);
  expect(project.turns[0]?.events.map((event) => event.event)).toEqual(
    expect.arrayContaining(["model_started", "files_saved", "build_started", "preview_started", "complete"]),
  );
  await testInfo.attach("project-result.json", {
    body: Buffer.from(JSON.stringify({
      projectId,
      trace,
      messages: project.messages,
      turns: project.turns,
      files: project.files.map((file) => file.path),
    }, null, 2)),
    contentType: "application/json",
  });

  return { preview, project, projectId, frame: page.frameLocator('[data-testid="generated-preview"]') };
}

test.describe("真实模型生成应用的代表性端到端验收", () => {
  test.skip(process.env.E2E_REAL_MODEL !== "1", "设置 E2E_REAL_MODEL=1 后才运行真实模型测试，避免意外消耗额度。 ");
  test.skip(!process.env.E2E_PRIMARY_EMAIL || !process.env.E2E_PRIMARY_PASSWORD, "Phase 2 需要真实 Supabase 测试账号。");

  for (const appCase of appCases) {
    test(appCase.name, async ({ page }, testInfo) => {
      const consoleErrors: string[] = [];
      const failedResponses: number[] = [];
      page.on("console", (message) => {
        if (message.type() === "error") consoleErrors.push(message.text());
      });
      page.on("pageerror", (error) => consoleErrors.push(error.message));
      page.on("response", response => { if (response.status() >= 400) failedResponses.push(response.status()); });

      const { frame, project, projectId } = await generateAndVerifyCore(page, testInfo, appCase);
      await expect(frame.locator("body")).toBeVisible();
      await appCase.exercise(frame);

      await page.getByRole("button", { name: "刷新预览" }).click();
      await expect(frame.locator("#root > *")).toBeVisible({ timeout: 10_000 });
      await appCase.verifyPersisted(frame);

      expect(page.url()).toContain(projectId);
      await page.reload({ waitUntil: "networkidle" });
      await expect(page.locator(".workspace-shell")).toBeVisible();
      const restoredPreview = page.getByTestId("generated-preview");
      await expect(restoredPreview).toHaveAttribute("data-project-id", projectId);
      await expect(restoredPreview).toHaveAttribute("data-version", String(project.currentVersion));
      await appCase.verifyPersisted(page.frameLocator('[data-testid="generated-preview"]'));

      const restoredResponse = await page.request.get(`/api/projects/${projectId}`);
      expect(restoredResponse.ok()).toBeTruthy();
      const restored = (await restoredResponse.json()) as PersistedProject;
      expect(restored).toMatchObject({
        projectId,
        projectName: project.projectName,
        summary: project.summary,
        currentVersion: 1,
        messages: project.messages,
        turns: project.turns,
        files: project.files,
      });
      expect(consoleErrors, `浏览器控制台错误：\n${consoleErrors.join("\n")}`).toEqual([]);
      expect(failedResponses, "正常链路不得出现 HTTP 4xx/5xx").toEqual([]);
    });
  }
});
