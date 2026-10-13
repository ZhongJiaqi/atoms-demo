import { hydrateProjectDirectory, loadProjectState } from "@/lib/agent/files";
import {
  loadPersistedProject,
  persistedBundleToRuntime,
  type ProjectStoreClient,
  requireAuthenticatedUser,
  requireProjectAccess,
} from "@/lib/persistence/project-store";
import { previewUrl } from "@/lib/preview-url";
import { buildProject, getPreview, startPreview } from "@/lib/sandbox/local-sandbox";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

type RouteContext = { params: Promise<{ projectId: string }> };

function originOf(request: Request) {
  const origin = request.headers.get("origin");
  return origin && /^https?:\/\/[^/]+$/i.test(origin) ? origin : new URL(request.url).origin;
}

export async function POST(request: Request, context: RouteContext) {
  const { projectId } = await context.params;
  const supabase = await createClient();
  const store = supabase as unknown as ProjectStoreClient;
  try {
    await requireAuthenticatedUser(store);
    await requireProjectAccess(store, projectId);
    const runtime = persistedBundleToRuntime(await loadPersistedProject(store, projectId));
    if (runtime.state.currentVersion < 1) throw new Error("项目尚无可恢复的成功版本。");

    const activePreview = getPreview(projectId);
    const activeState = activePreview ? await loadProjectState(activePreview.projectDir).catch(() => null) : null;
    if (!activePreview || activeState?.currentVersion !== runtime.state.currentVersion) {
      const projectDir = await hydrateProjectDirectory(runtime.state, runtime.project);
      const build = await buildProject(projectDir);
      if (!build.success) throw new Error(`持久化源码重新构建失败：${build.stderr || build.stdout}`.slice(-4_000));
      await startPreview(projectId, projectDir);
    }

    return Response.json(
      {
        projectId: runtime.state.projectId,
        projectName: runtime.state.projectName,
        summary: runtime.state.summary,
        currentVersion: runtime.state.currentVersion,
        messages: runtime.state.messages,
        turns: runtime.state.turns,
        files: runtime.project.files,
        previewUrl: previewUrl(originOf(request), projectId, runtime.state.currentVersion),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "项目恢复失败。";
    const status = message.includes("登录") ? 401 : message.includes("无权") || message.includes("不存在") ? 404 : 500;
    return Response.json({ error: message }, { status });
  }
}
