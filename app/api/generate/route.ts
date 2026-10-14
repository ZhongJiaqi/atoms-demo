import { runGeneration } from "../../../lib/agent/run-generation.ts";
import type { AgentEvent } from "../../../lib/agent/types.ts";
import {
  createProjectDraft,
  type ProjectStoreClient,
  projectSnapshotFromState,
  requireAuthenticatedUser,
  requireProjectAccess,
  saveProjectSnapshot,
} from "../../../lib/persistence/project-store.ts";
import { createClient } from "../../../lib/supabase/server.ts";
import { runCloudGeneration } from "../../../lib/agent/run-cloud-generation.ts";
import { createCloudPreviewLink } from "../../../lib/cloud/preview-access.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

declare global {
  // eslint-disable-next-line no-var
  var __atomsGenerationActive: boolean | undefined;
}

function sse(event: AgentEvent) {
  return `event: ${event.event}\ndata: ${JSON.stringify(event.data)}\n\n`;
}

export async function POST(request: Request) {
  let requirement = "";
  let projectId: string | undefined;
  try {
    const body = (await request.json()) as { requirement?: unknown; projectId?: unknown };
    requirement = typeof body.requirement === "string" ? body.requirement.trim() : "";
    projectId = typeof body.projectId === "string" && body.projectId.trim() ? body.projectId.trim() : undefined;
  } catch {
    return Response.json({ error: "请求体必须是 JSON。" }, { status: 400 });
  }

  const minimumLength = projectId ? 2 : 4;
  if (requirement.length < minimumLength || requirement.length > 2_000) {
    return Response.json(
      { error: `需求描述长度必须在 ${minimumLength} 到 2000 个字符之间。` },
      { status: 400 },
    );
  }
  if (projectId && !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(projectId)) {
    return Response.json({ error: "项目 ID 格式无效。" }, { status: 400 });
  }

  const supabase = await createClient();
  const projectStore = supabase as unknown as ProjectStoreClient;
  try {
    await requireAuthenticatedUser(projectStore);
    if (projectId) await requireProjectAccess(projectStore, projectId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "请先登录后再访问项目。";
    return Response.json({ error: message }, { status: projectId ? 403 : 401 });
  }
  const cloud = process.env.VERCEL === "1";
  if (!cloud && globalThis.__atomsGenerationActive) {
    return Response.json({ error: "演示版同一时间只运行一个生成任务，请稍后重试。" }, { status: 429 });
  }
  if (!cloud) globalThis.__atomsGenerationActive = true;

  const encoder = new TextEncoder();
  const browserOrigin = request.headers.get("origin");
  const origin = browserOrigin && /^https?:\/\/[^/]+$/i.test(browserOrigin)
    ? browserOrigin
    : new URL(request.url).origin;
  const streamState = { cancelled: false };
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const send = (event: AgentEvent) => {
        if (!closed && !streamState.cancelled) controller.enqueue(encoder.encode(sse(event)));
      };
      const heartbeat = setInterval(() => {
        if (!closed && !streamState.cancelled) controller.enqueue(encoder.encode(`: heartbeat ${Date.now()}\n\n`));
      }, 10_000);

      let savedComplete: AgentEvent | undefined;
      const task = cloud ? runCloudGeneration(requirement, origin, event => {
        if (event.event === "complete") savedComplete = event;
        else send(event);
      }, supabase, projectId) : runGeneration(
        requirement,
        origin,
        send,
        {
          createDraft: (newProjectId) => createProjectDraft(projectStore, { projectId: newProjectId, name: "正在创建项目" }),
          async saveVersion(state, project, turn, expectedVersion) {
            const savedVersion = await saveProjectSnapshot(
              projectStore,
              projectSnapshotFromState(state, project, turn, expectedVersion),
            );
            if (savedVersion !== turn.version) {
              throw new Error(`项目保存失败：预期版本 ${turn.version}，数据库返回版本 ${savedVersion}。`);
            }
            return savedVersion;
          },
        },
        projectId,
      );
      void task
        .then(async () => {
          if (!savedComplete) return;
          let preview: Record<string, unknown>;
          try {
            preview = await createCloudPreviewLink(supabase, savedComplete.data.projectId as string, savedComplete.data.version as number, savedComplete.data.artifactPath as string);
          } catch (error) {
            preview = { previewReady: false, previewError: error instanceof Error ? error.message : "云端预览配置不可用" };
          }
          send({ ...savedComplete, data: { ...savedComplete.data, ...preview } });
        })
        .catch((error: unknown) => {
          const message = error instanceof Error ? error.message : "生成流程发生未知错误。";
          send({ event: "error", data: { message } });
        })
        .finally(() => {
          if (!cloud) globalThis.__atomsGenerationActive = false;
          clearInterval(heartbeat);
          closed = true;
          if (!streamState.cancelled) controller.close();
        });
    },
    cancel() {
      streamState.cancelled = true;
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

