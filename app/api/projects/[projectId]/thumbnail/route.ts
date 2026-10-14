import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { chromium } from "playwright";
import { after } from "next/server";
import { GENERATED_ROOT, hydrateProjectDirectoryAt } from "@/lib/agent/files";
import { loadPersistedProject, loadProjectVersion, requireAuthenticatedUser, requireProjectAccess, type ProjectStoreClient } from "@/lib/persistence/project-store";
import { createThumbnailQueue } from "@/lib/preview/thumbnail-queue";
import { trimThumbnailCache } from "@/lib/preview/thumbnail-cache";
import { restrictThumbnailBrowser } from "@/lib/preview/thumbnail-browser";
import { buildProject, discardStagedPreview, startPreview } from "@/lib/sandbox/local-sandbox";
import { createClient } from "@/lib/supabase/server";
import { readArtifact } from "@/lib/cloud/artifacts";
import { versionArtifactPath } from "@/lib/cloud/preview-access";
import { getOrCreateProjectThumbnail, validateProjectThumbnail } from "@/lib/cloud/project-thumbnail";
import { captureCloudThumbnail } from "@/lib/cloud/capture-thumbnail";
import { buildInVercelSandbox } from "@/lib/sandbox/vercel-build";
import { collectArtifactBundle } from "@/lib/sandbox/index";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const cacheRoot = join(GENERATED_ROOT, ".thumbnails");
const enqueue = createThumbnailQueue(6);
class ThumbnailTimeoutError extends Error {}

export async function GET(request: Request, context: { params: Promise<{ projectId: string }> }) {
  if (process.env.VERCEL !== "1") return thumbnail(request, context);
  const deadline = Date.now() + 260000;
  let expired = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const remaining = () => {
    const milliseconds = deadline - Date.now();
    if (expired || milliseconds <= 0) throw new ThumbnailTimeoutError("封面生成超时，请稍后重试。");
    return milliseconds;
  };
  const work = thumbnail(request, context, remaining);
  const timeout = new Promise<Response>(resolve => {
    timer = setTimeout(() => {
      expired = true;
      // Keep only the already-started work alive until its VM/tmp cleanup settles.
      after(() => work.catch(() => undefined));
      resolve(Response.json({ error: "封面生成超时，请稍后重试。" }, { status: 503, headers: { "Cache-Control": "no-store" } }));
    }, 260000);
  });
  try { return await Promise.race([work, timeout]); }
  finally { if (timer) clearTimeout(timer); }
}

async function thumbnail(request: Request, context: { params: Promise<{ projectId: string }> }, remaining?: () => number) {
  const { projectId } = await context.params;
  const client = await createClient();
  const store = client as unknown as ProjectStoreClient;
  try {
    const owner = await requireAuthenticatedUser(store);
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(projectId)) return Response.json({ error: "无效项目 ID。" }, { status: 400 });
    const access = await requireProjectAccess(store, projectId);
    const version = Number(new URL(request.url).searchParams.get("version"));
    if (!Number.isSafeInteger(version) || version < 1 || version > access.currentVersion) return Response.json({ error: "无效项目版本。" }, { status: 400 });
    if (process.env.VERCEL === "1") {
      const check = remaining!;
      check();
      const bundle = await loadPersistedProject(store, projectId);
      const artifactPath = versionArtifactPath(bundle, owner.id, version);
      check();
      const run = bundle.runs.find(run => run.status === "completed" && run.version === version);
      const recorded = run?.events.find(event => event.event === "complete")?.data.artifactPath !== undefined;
      const artifact = recorded ? await readArtifact(client, projectId, artifactPath) : undefined;
      check();
      const capture = async (input: Parameters<typeof captureCloudThumbnail>[0]) => {
        const timeoutMs = Math.min(120000, check() - 20000);
        if (timeoutMs < 1000) throw new ThumbnailTimeoutError("封面生成超时，请稍后重试。");
        const png = await captureCloudThumbnail(input, { timeoutMs });
        check(); // Do not start cache upload after this request has expired.
        return png;
      };
      const png = artifact?.thumbnail ? validateProjectThumbnail(Buffer.from(artifact.thumbnail, "base64")) : await enqueue(`cloud:${owner.id}:${projectId}:${version}`, () => {
        check(); // Expired queued jobs must never launch a new VM.
        return getOrCreateProjectThumbnail(client, projectId, version, async () => {
          check();
          if (artifact) return capture(artifact);
          const project = await loadProjectVersion(store, projectId, version);
          if (check() < 190000) throw new ThumbnailTimeoutError("截图服务繁忙，剩余构建时间不足，请稍后重试。");
          const root = await mkdtemp(join(tmpdir(), "atoms-cloud-thumbnail-"));
          try {
            const now = new Date().toISOString();
            const directory = await hydrateProjectDirectoryAt(root, { projectId, projectName: project.projectName, summary: project.summary, currentVersion: version, createdAt: now, updatedAt: now, messages: [], turns: [] }, project);
            if (check() < 190000) throw new ThumbnailTimeoutError("截图服务繁忙，剩余构建时间不足，请稍后重试。");
            const build = await buildInVercelSandbox(directory);
            if (!build.success) throw new Error("主页截图云构建失败。");
            check();
            return await capture(await collectArtifactBundle(directory));
          } finally { await rm(root, { recursive: true, force: true }); }
        });
      });
      check();
      return new Response(new Uint8Array(png), {headers:{"Content-Type":"image/png","Cache-Control":"private, no-store","X-Project-Version":String(version),"X-Content-Type-Options":"nosniff"}});
    }
    const cachePath = join(cacheRoot, `${projectId}-${version}.png`);
    let png: Buffer;
    try { png = await readFile(cachePath); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      png = await enqueue(`${projectId}-${version}`, async () => {
        try { return await readFile(cachePath); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
        const project = await loadProjectVersion(store, projectId, version);
        await mkdir(cacheRoot, { recursive: true, mode: 0o700 });
        const root = await mkdtemp(join(GENERATED_ROOT, `thumbnail-${projectId}-`));
        const stagedId = randomUUID();
        let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
        try {
          const now = new Date().toISOString();
          const directory = await hydrateProjectDirectoryAt(root, { projectId, projectName: project.projectName, summary: project.summary, currentVersion: version, createdAt: now, updatedAt: now, messages: [], turns: [] }, project);
          const build = await buildProject(directory);
          if (!build.success) throw new Error("主页截图构建失败。");
          const preview = await startPreview(stagedId, directory);
          const origin = `http://127.0.0.1:${preview.port}`;
          browser = await chromium.launch({ headless: true, timeout: 10000, chromiumSandbox: true, env: { PATH: process.env.PATH || "", HOME: process.env.HOME || "", TMPDIR: process.env.TMPDIR || "/tmp" }, args: ["--renderer-process-limit=2", "--disable-background-networking", "--force-webrtc-ip-handling-policy=disable_non_proxied_udp"] });
          const page = await browser.newPage({ viewport: { width: 960, height: 600 }, serviceWorkers: "block" });
          // 无登录 Cookie/用户存储；只允许本次随机沙盒的静态资源，不访问其他项目或外网。
          await restrictThumbnailBrowser(page.context(), origin);
          await page.goto(origin, { waitUntil: "networkidle", timeout: 10000 });
          await page.waitForFunction(() => Boolean(document.querySelector("#root")?.textContent?.trim() || document.querySelector("#root")?.children.length), undefined, { timeout: 5000 });
          const bytes = await page.screenshot({ type: "png", animations: "disabled", timeout: 5000 });
          const pendingPath = join(root, "thumbnail.png");
          await writeFile(pendingPath, bytes, { mode: 0o600 });
          await rename(pendingPath, cachePath);
          await trimThumbnailCache(cacheRoot, 32 * 1024 * 1024);
          return bytes;
        } finally {
          try { await browser?.close(); }
          finally { discardStagedPreview(stagedId); await rm(root, { recursive: true, force: true }); }
        }
      });
    }
    return new Response(new Uint8Array(png), { headers: { "Content-Type": "image/png", "Cache-Control": "private, no-store", "X-Project-Version": String(version), "X-Content-Type-Options": "nosniff" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "主页截图不可用。";
    const status = error instanceof ThumbnailTimeoutError ? 503 : message.includes("登录") ? 401 : message.includes("无权") || message.includes("不存在") ? 404 : message.includes("繁忙") ? 503 : 500;
    return Response.json({ error: status === 500 ? "主页截图暂不可用，请打开项目重试。" : message }, { status, headers: { "Cache-Control": "no-store" } });
  }
}
