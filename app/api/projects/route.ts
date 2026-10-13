import {
  listUserProjects,
  type ProjectStoreClient,
  requireAuthenticatedUser,
} from "@/lib/persistence/project-store";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
  const store = supabase as unknown as ProjectStoreClient;
  try {
    await requireAuthenticatedUser(store);
    const projects = await listUserProjects(store);
    return Response.json({ projects }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "历史项目读取失败。";
    return Response.json({ error: message }, { status: message.includes("登录") ? 401 : 500 });
  }
}
