import { requireAuthenticatedUser, requireProjectAccess, type ProjectStoreClient } from "@/lib/persistence/project-store";
import { getPreview } from "@/lib/sandbox/local-sandbox";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await context.params;
  const store = await createClient() as unknown as ProjectStoreClient;
  try {
    await requireAuthenticatedUser(store);
    const access = await requireProjectAccess(store, projectId);
    if (process.env.VERCEL === "1") return Response.json({active: access.currentVersion > 0, cloud: true, expiresAt: null, currentVersion: access.currentVersion}, {headers:{"Cache-Control":"no-store"}});
    const preview = getPreview(projectId);
    return Response.json({ active: Boolean(preview), expiresAt: preview?.expiresAt ?? null, currentVersion: access.currentVersion }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "预览状态检查失败。";
    const status = message.includes("登录") ? 401 : message.includes("无权") || message.includes("不存在") ? 404 : 500;
    return Response.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
  }
}
