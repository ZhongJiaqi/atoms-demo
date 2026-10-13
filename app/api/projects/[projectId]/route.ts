import {
  loadPersistedProject,
  persistedBundleToRuntime,
  type ProjectStoreClient,
  requireAuthenticatedUser,
  requireProjectAccess,
} from "@/lib/persistence/project-store";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ projectId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { projectId } = await context.params;
  const supabase = await createClient();
  const store = supabase as unknown as ProjectStoreClient;
  try {
    await requireAuthenticatedUser(store);
    await requireProjectAccess(store, projectId);
    const { state, project } = persistedBundleToRuntime(await loadPersistedProject(store, projectId));
    return Response.json(
      {
        projectId: state.projectId,
        projectName: state.projectName,
        summary: state.summary,
        currentVersion: state.currentVersion,
        messages: state.messages,
        turns: state.turns,
        files: project.files,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "项目不存在或当前不可读取。";
    const status = message.includes("登录") ? 401 : message.includes("无权") || message.includes("不存在") ? 404 : 500;
    return Response.json({ error: message }, { status });
  }
}
