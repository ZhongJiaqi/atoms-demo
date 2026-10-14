import { execFile as execFileCallback } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFile, readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import { createProjectDraft, projectSnapshotFromState, saveProjectSnapshot, type ProjectStoreClient } from "../../lib/persistence/project-store";
import type { ProjectState, ProjectTurn } from "../../lib/agent/types";
import { GENERATED_ROOT } from "../../lib/agent/files";

const execFile = promisify(execFileCallback);

test("真实数据库历史回滚、iframe、刷新及恢复后继续修改同项目", async ({ page, browser }, testInfo) => {
  test.skip(process.env.E2E_REAL_MODEL !== "1", "最后一步需要真实模型修改，必须显式启用。");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
  const projectRef = new URL(url).hostname.split(".")[0];
  // 高权限凭据仅在测试 Node 进程内使用，用于创建/清理本用例账号，不发送至浏览器。
  const { stdout } = await execFile("supabase", ["projects", "api-keys", "--project-ref", projectRef, "-o", "json"]);
  const keys = JSON.parse(stdout) as Array<{ name: string; api_key: string }>;
  const serviceKey = keys.find((key) => key.name === "service_role")?.api_key;
  if (!serviceKey) throw new Error("CLI 未返回测试所需的管理凭据。");
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const email = `atoms-rollback-${randomUUID()}@example.invalid`;
  const password = `Rollback-${randomUUID()}`;
  const { data: created, error: createError } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (createError || !created.user) throw new Error(createError?.message || "测试账号创建失败。");
  const projectId = randomUUID();
  let otherUserId: string | undefined;
  const user = createClient(url, publishable, { auth: { persistSession: false, autoRefreshToken: false } });
  const errors: string[] = [];
  const failures: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  page.on("response", (response) => { if (response.status() >= 400) failures.push(`${response.status()} ${response.url()}`); });
  try {
    const { error } = await user.auth.signInWithPassword({ email, password });
    if (error) throw error;
    const store = user as unknown as ProjectStoreClient;
    await createProjectDraft(store, { projectId, name: "回滚验收" });
    const state: ProjectState = { projectId, projectName: "回滚验收", summary: "", currentVersion: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), messages: [], turns: [] };
    // 明确的测试源码快照；回滚本身不应调用模型。最后一轮修改才调用真实模型。
    for (const version of [1, 2]) {
      const at = new Date().toISOString();
      const marker = version === 1 ? "首版" : "深色版";
      const project = { projectName: state.projectName, summary: marker, files: [
        { path: "src/App.tsx", content: `import {useState} from "react"; export default function App(){const [count,setCount]=useState(0);return <main><h1 data-testid="version-marker">${marker}</h1><button onClick={()=>setCount(count+1)}>计数 {count}</button></main>}` },
        { path: "src/styles.css", content: version === 1 ? "body{background:white;color:black}" : "body{background:#111;color:white}" },
      ] };
      const turn: ProjectTurn = { id: randomUUID(), mode: version === 1 ? "create" : "modify", requirement: marker, status: "completed", startedAt: at, completedAt: at, version, summary: marker, model: "回滚测试源码", buildAttempts: 1, events: [] };
      state.currentVersion = version; state.summary = marker; state.updatedAt = at;
      state.turns.push(turn);
      state.messages.push({ id: randomUUID(), role: "user", content: marker, createdAt: at, turnId: turn.id }, { id: randomUUID(), role: "assistant", content: marker, createdAt: at, turnId: turn.id });
      expect(await saveProjectSnapshot(store, projectSnapshotFromState(state, project, turn, version - 1))).toBe(version);
    }
    await page.goto(`/login?next=${encodeURIComponent(`/?project=${projectId}`)}`);
    await page.getByLabel("邮箱").fill(email);
    await page.getByLabel("密码").fill(password);
    await page.getByRole("button", { name: "登录", exact: true }).click();
    const preview = page.getByTestId("generated-preview");
    await expect(preview).toHaveAttribute("data-version", "2");
    await expect(page.frameLocator('[data-testid="generated-preview"]').getByTestId("version-marker")).toHaveText("深色版");
    // 只终止本用例 UUID 目录下的 Vite；验证真实进程消失后无需刷新工作区即可恢复。
    const statusUrl = `/api/projects/${projectId}/preview-status`;
    const beforeRecovery = await page.request.get(statusUrl);
    expect(beforeRecovery.status()).toBe(200);
    expect(await beforeRecovery.json()).toMatchObject({ active: true, currentVersion: 2 });
    const previewPids = async () => {
      const { stdout: processes } = await execFile("lsof", ["-nP", "-a", "-c", "node", "-d", "cwd", "-Fpn"]);
      let pid = 0;
      const matches: number[] = [];
      for (const line of processes.split("\n")) {
        if (line.startsWith("p")) pid = Number(line.slice(1));
        if (line === `n${join(GENERATED_ROOT, projectId)}` && pid > 1 && pid !== process.pid) matches.push(pid);
      }
      return matches;
    };
    const oldPids = await previewPids();
    expect(oldPids).toHaveLength(1);
    process.kill(oldPids[0], "SIGTERM");
    await expect.poll(async () => (await (await page.request.get(statusUrl)).json()).active).toBe(false);
    const resumedResponses = Promise.all([page.request.post(`/api/projects/${projectId}/resume`), page.request.post(`/api/projects/${projectId}/resume`)]);
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    const joined = await resumedResponses;
    expect(joined.map((response) => response.status())).toEqual([200, 200]);
    const joinedData = await Promise.all(joined.map((response) => response.json()));
    expect(joinedData.map((data) => data.currentVersion)).toEqual([2, 2]);
    expect(joinedData[0].expiresAt).toBe(joinedData[1].expiresAt);
    await expect(page.frameLocator('[data-testid="generated-preview"]').getByTestId("version-marker")).toHaveText("深色版", { timeout: 60000 });
    await page.frameLocator('[data-testid="generated-preview"]').getByRole("button", { name: "计数 0", exact: true }).click();
    await expect(page.frameLocator('[data-testid="generated-preview"]').getByRole("button", { name: "计数 1", exact: true })).toBeVisible();
    await expect.poll(previewPids).not.toEqual(oldPids);
    expect(await previewPids()).toHaveLength(1);
    expect((await user.from("project_versions").select("version").eq("project_id", projectId).order("version")).data?.map((item) => item.version)).toEqual([1, 2]);
    const firstCover = await page.request.get(`/api/projects/${projectId}/thumbnail?version=2`);
    expect(firstCover.headers()["cache-control"]).toContain("no-store");
    await page.getByRole("button", { name: "历史记录", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "历史记录", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "恢复到版本 v1", exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("version-history.png") });
    await page.getByRole("button", { name: "恢复到版本 v1", exact: true }).click();
    await expect(preview).toHaveAttribute("data-version", "3", { timeout: 60000 });
    await expect(preview).toHaveAttribute("data-project-id", projectId);
    let frame = page.frameLocator('[data-testid="generated-preview"]');
    await expect(frame.getByTestId("version-marker")).toHaveText("首版");
    await frame.getByRole("button", { name: "计数 0", exact: true }).click();
    await expect(frame.getByRole("button", { name: "计数 1", exact: true })).toBeVisible();
    const { data: versions, error: versionError } = await user.from("project_versions").select("version,files").eq("project_id", projectId).order("version");
    if (versionError) throw versionError;
    expect(versions?.map((item) => item.version)).toEqual([1, 2, 3]);
    expect(versions?.[2].files).toEqual(versions?.[0].files);
    const firstRuntime = (await readdir(GENERATED_ROOT)).find((name) => name.startsWith(`restore-${projectId}-`));
    expect(firstRuntime).toBeTruthy();
    const localState = JSON.parse(await readFile(join(GENERATED_ROOT, firstRuntime!, projectId, "project-state.json"), "utf8"));
    const { data: restoredRun, error: runError } = await user.from("agent_runs").select("events").eq("project_id", projectId).eq("version", 3).single();
    if (runError) throw runError;
    expect(localState.turns.at(-1).events).toEqual(restoredRun.events);
    const staleRestore = await page.request.post(`/api/projects/${projectId}/restore`, { data: { version: 1, expectedVersion: 2 } });
    expect(staleRestore.status()).toBe(409);
    const foreignRestore = await page.request.post(`/api/projects/${randomUUID()}/restore`, { data: { version: 1, expectedVersion: 3 } });
    expect(foreignRestore.status()).toBe(404);
    await page.reload();
    await expect(page.getByTestId("generated-preview")).toHaveAttribute("data-version", "3");
    await expect(page.frameLocator('[data-testid="generated-preview"]').getByTestId("version-marker")).toHaveText("首版");
    await page.locator("#workspace-requirement").fill("把页面标题改成‘回滚后继续修改’，保留计数按钮和 data-testid=version-marker。保持当前浅色样式，不增加深色模式。");
    await page.getByRole("button", { name: "发送修改需求" }).click();
    await expect(page.getByTestId("generated-preview")).toHaveAttribute("data-version", "4", { timeout: 360000 });
    await expect(page.getByTestId("generated-preview")).toHaveAttribute("data-project-id", projectId);
    frame = page.frameLocator('[data-testid="generated-preview"]');
    await expect(frame.getByTestId("version-marker")).toHaveText("回滚后继续修改");
    await frame.getByRole("button", { name: "计数 0", exact: true }).click();
    await expect(frame.getByRole("button", { name: "计数 1", exact: true })).toBeVisible();
    await createProjectDraft(store, { projectId: randomUUID(), name: "更晚创建但尚未成功的草稿" });
    await page.goto("/");
    const myProjects = page.getByRole("region", { name: "我的项目", exact: true });
    await expect(myProjects.locator(".home-project-card")).toHaveCount(1);
    await expect(myProjects.locator(".home-project-card p")).toHaveCount(0);
    await expect(myProjects.locator(`a[href="/?project=${projectId}"]`)).toHaveCount(1);
    await expect(myProjects.getByTestId("project-version")).toHaveCount(0);
    await expect(myProjects.getByRole("button", { name: "历史项目", exact: true })).toHaveCount(0);
    const cover = myProjects.locator(`img[data-project-id="${projectId}"]`);
    await expect(cover).toHaveAttribute("data-version", "4");
    await expect.poll(() => cover.evaluate((el) => (el as HTMLImageElement).naturalWidth), { timeout: 60000 }).toBe(960);
    const thumbnail = await page.request.get(`/api/projects/${projectId}/thumbnail?version=4`);
    expect(thumbnail.headers()["content-type"]).toContain("image/png");
    expect(thumbnail.headers()["x-project-version"]).toBe("4");
    expect([...(await thumbnail.body()).subarray(0, 8)]).toEqual([137,80,78,71,13,10,26,10]);
    const oldThumbnail = await page.request.get(`/api/projects/${projectId}/thumbnail?version=1`);
    expect(oldThumbnail.headers()["x-project-version"]).toBe("1");
    expect((await oldThumbnail.body()).equals(await thumbnail.body())).toBe(false);
    expect((await readdir(GENERATED_ROOT)).filter((name) => name.startsWith(`thumbnail-${projectId}-`))).toEqual([]);
    await expect(page.getByRole("button", { name: "退出登录", exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("home-projects.png"), fullPage: true });
    await myProjects.locator(`a[href="/?project=${projectId}"]`).click();
    await expect(page.getByTestId("generated-preview")).toHaveAttribute("data-version", "4", { timeout: 3000 });
    await expect(page.getByTestId("generated-preview")).toHaveAttribute("data-project-id", projectId);
    await expect(page.frameLocator('[data-testid="generated-preview"]').getByTestId("version-marker")).toHaveText("回滚后继续修改");
    await page.getByRole("button", { name: "历史记录", exact: true }).click();
    await page.getByRole("button", { name: "恢复到版本 v1", exact: true }).click();
    await expect(page.getByTestId("generated-preview")).toHaveAttribute("data-version", "5", { timeout: 60000 });
    await expect(page.frameLocator('[data-testid="generated-preview"]').getByTestId("version-marker")).toHaveText("首版");
    const remainingRuntime = (await readdir(GENERATED_ROOT)).filter((name) => name.startsWith(`restore-${projectId}-`));
    expect(remainingRuntime).toHaveLength(1);
    expect(remainingRuntime[0]).not.toBe(firstRuntime);
    const otherEmail = `atoms-rollback-other-${randomUUID()}@example.invalid`;
    const { data: otherCreated, error: otherCreateError } = await admin.auth.admin.createUser({ email: otherEmail, password, email_confirm: true });
    if (otherCreateError || !otherCreated.user) throw new Error("第二测试账号创建失败。");
    otherUserId = otherCreated.user.id;
    const otherContext = await browser.newContext();
    try {
      const otherPage = await otherContext.newPage();
      await otherPage.goto(`${new URL(page.url()).origin}/login`);
      await otherPage.getByLabel("邮箱").fill(otherEmail);
      await otherPage.getByLabel("密码").fill(password);
      await otherPage.getByRole("button", { name: "登录", exact: true }).click();
      await otherPage.waitForURL((target) => target.pathname === "/");
      const denied = await otherPage.request.post(`${new URL(page.url()).origin}/api/projects/${projectId}/restore`, { data: { version: 1, expectedVersion: 4 } });
      expect(denied.status()).toBe(404);
      const otherProjects = await otherPage.request.get(`${new URL(page.url()).origin}/api/projects`);
      expect((await otherProjects.json()).projects).toEqual([]);
      const privateCover = await otherPage.request.get(`${new URL(page.url()).origin}/api/projects/${projectId}/thumbnail?version=4`);
      expect(privateCover.status()).toBe(404);
    } finally { await otherContext.close(); }
    expect(errors).toEqual([]); expect(failures).toEqual([]);
    // 同一浏览器上下文先由 A 加载 v4 封面，再退出并登录 B：不得命中 A 的私有浏览器缓存。
    await page.getByRole("button", { name: "退出登录", exact: true }).click();
    await page.waitForURL((target) => target.pathname === "/" && !target.search, { timeout: 15000 });
    await page.goto("/login");
    await page.getByLabel("邮箱").fill(otherEmail);
    await page.getByLabel("密码").fill(password);
    await page.getByRole("button", { name: "登录", exact: true }).click();
    await page.waitForURL((target) => target.pathname === "/", { timeout: 15000 });
    const privateUrl = `${new URL(page.url()).origin}/api/projects/${projectId}/thumbnail?version=4`;
    const deniedImageResponse = page.waitForResponse((response) => response.url() === privateUrl);
    expect(await page.evaluate((url) => new Promise<string>((resolve) => {
      const img = new Image(); img.onload = () => resolve("loaded"); img.onerror = () => resolve("denied");
      img.src = url; document.body.append(img);
    }), privateUrl)).toBe("denied");
    expect((await deniedImageResponse).status()).toBe(404);
    expect(failures).toEqual([`404 ${privateUrl}`]);
    expect(errors.filter((message) => !message.includes("404"))).toEqual([]);
  } finally {
    // 只清理本用例新建的项目/用户；其他真实用户与项目保持不变。
    const { error: deleteProjectError } = await admin.from("projects").delete().eq("id", projectId);
    const { error: deleteUserError } = await admin.auth.admin.deleteUser(created.user.id);
    if (otherUserId) {
      const { error: otherDeleteError } = await admin.auth.admin.deleteUser(otherUserId);
      if (otherDeleteError) throw new Error("第二测试账号清理失败。");
    }
    if (deleteProjectError || deleteUserError) throw new Error("测试数据清理失败，请检查本用例记录。");
    for (const name of await readdir(GENERATED_ROOT)) {
      if (name === projectId || name.startsWith(`restore-${projectId}-`)) {
        await rm(join(GENERATED_ROOT, name), { recursive: true, force: true });
      }
    }
    for (const name of await readdir(join(GENERATED_ROOT, ".thumbnails")).catch(() => [])) {
      if (name.startsWith(`${projectId}-`)) await rm(join(GENERATED_ROOT, ".thumbnails", name));
    }
  }
});
