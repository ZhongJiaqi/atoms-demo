import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { GENERATED_ROOT, hydrateProjectDirectoryAt, saveProjectState } from "@/lib/agent/files";
import { createClient } from "@/lib/supabase/server";
import { confirmRestoredVersion, loadPersistedProject, loadProjectVersion, persistedBundleToRuntime, projectSnapshotFromState, requireAuthenticatedUser, requireProjectAccess, saveProjectSnapshot, type ProjectStoreClient } from "@/lib/persistence/project-store";
import { restoreProjectVersion } from "@/lib/persistence/restore-version";
import { activateStagedPreview, buildProject, discardStagedPreview, getProjectRuntimeDirectory, startPreview } from "@/lib/sandbox/local-sandbox";
import { previewUrl } from "@/lib/preview-url";
import { restoreCloudProject } from "@/lib/cloud/project-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
type Context = { params: Promise<{ projectId: string }> };

async function cleanupPreviousRuntime(projectId: string, previousDir?: string) {
  if (!previousDir) return;
  const previousRoot = dirname(previousDir);
  if (dirname(previousRoot) === resolve(GENERATED_ROOT) && basename(previousRoot).startsWith(`restore-${projectId}-`)) {
    await rm(previousRoot, { recursive: true, force: true }).catch(() => console.warn("旧恢复运行目录清理失败，需后续清理。"));
  }
}

export async function POST(request: Request, context: Context) {
  const { projectId } = await context.params;
  const supabase = await createClient();
  const store = supabase as unknown as ProjectStoreClient;
  try { await requireAuthenticatedUser(store); }
  catch { return Response.json({ error: "请先登录后再恢复版本。" }, { status: 401 }); }
  let targetVersion: number;
  let expectedVersion: number;
  try {
    const body = await request.json();
    targetVersion = body.version; expectedVersion = body.expectedVersion;
    if (!Number.isInteger(targetVersion) || targetVersion < 1 || !Number.isInteger(expectedVersion) || expectedVersion < 1) throw new Error();
  } catch { return Response.json({ error: "版本参数无效。" }, { status: 400 }); }
  try { await requireProjectAccess(store, projectId); }
  catch { return Response.json({ error: "项目不存在或你无权访问。" }, { status: 404 }); }
  if (process.env.VERCEL === "1") {
    try {
      const restored = await restoreCloudProject(supabase, projectId, targetVersion, expectedVersion);
      return Response.json({projectId,currentVersion:restored.state.currentVersion,restoredFrom:targetVersion,artifactPath:restored.artifactPath,previewReady:restored.previewReady,previewUrl:"previewUrl" in restored ? restored.previewUrl : undefined,previewError:"previewError" in restored ? restored.previewError : undefined,expiresAt:restored.expiresAt},{headers:{"Cache-Control":"no-store"}});
    } catch(error) {
      const message=error instanceof Error ? error.message : "云端版本恢复失败";
      const status=/版本已变化|version conflict|租约|其他任务/.test(message) ? 409 : /无权|不存在/.test(message) ? 404 : /只能恢复/.test(message) ? 400 : 500;
      return Response.json({error:message},{status,headers:{"Cache-Control":"no-store"}});
    }
  }
  if (globalThis.__atomsGenerationActive) return Response.json({ error: "任务正在执行，请稍后恢复。" }, { status: 409 });
  globalThis.__atomsGenerationActive = true;
  try {
    const origin = request.headers.get("origin") || new URL(request.url).origin;
    const restoredPreviewUrl = previewUrl(origin, projectId, expectedVersion + 1);
    const { state } = persistedBundleToRuntime(await loadPersistedProject(store, projectId));
    const project = await loadProjectVersion(store, projectId, targetVersion);
    let previewReady = true;
    const result = await restoreProjectVersion({ state, project, targetVersion, expectedVersion }, {
      async stage(nextState, target) {
        await mkdir(GENERATED_ROOT, { recursive: true, mode: 0o700 });
        const root = await mkdtemp(join(GENERATED_ROOT, `restore-${projectId}-`));
        const stagedId = randomUUID();
        try {
          const dir = await hydrateProjectDirectoryAt(root, nextState, target);
          const build = await buildProject(dir);
          if (!build.success) throw new Error(`历史版本构建失败：${build.stderr || build.stdout}`.slice(-4000));
          const entry = await startPreview(stagedId, dir);
          return { root, stagedId, entry };
        } catch (error) {
          discardStagedPreview(stagedId);
          await rm(root, { recursive: true, force: true });
          throw error;
        }
      },
      async save(nextState, target, turn, expected) {
        return saveProjectSnapshot(store, projectSnapshotFromState(nextState, target, turn, expected));
      },
      async finalize(staging, nextState) { await saveProjectState(staging.entry.projectDir, nextState); },
      isCommitted: (turnId, version) => confirmRestoredVersion(store, projectId, turnId, version),
      async activate(staging) {
        const activation = activateStagedPreview(staging.entry, projectId);
        if (!activation.activated) {
          previewReady = false;
          const previousDir = getProjectRuntimeDirectory(projectId);
          discardStagedPreview(projectId);
          discardStagedPreview(staging.stagedId);
          await rm(staging.root, { recursive: true, force: true }).catch(() => console.warn("失效恢复目录清理失败，需后续清理。"));
          await cleanupPreviousRuntime(projectId, previousDir);
          return;
        }
        await cleanupPreviousRuntime(projectId, activation.previousDirectory);
      },
      async discard(staging) {
        discardStagedPreview(staging.stagedId);
        await rm(staging.root, { recursive: true, force: true });
      },
    });
    // 新运行目录是预览与后续修改基线，永久恢复来源仍是 Supabase 快照。
    return Response.json({ projectId, currentVersion: result.state.currentVersion, restoredFrom: targetVersion, previewReady, previewUrl: restoredPreviewUrl }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "版本恢复失败。";
    const status = /版本已变化|version conflict/.test(message) ? 409 : /无权|不存在/.test(message) ? 404 : /只能恢复/.test(message) ? 400 : 500;
    return Response.json({ error: message }, { status });
  } finally { globalThis.__atomsGenerationActive = false; }
}
