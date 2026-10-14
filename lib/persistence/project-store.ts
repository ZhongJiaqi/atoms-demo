import type { GeneratedProject, ProjectState, ProjectTurn } from "../agent/types";

export type AuthClient = {
  auth: {
    getUser: () => Promise<{ data: { user: { id: string; email?: string } | null }; error: { message: string } | null }>;
  };
};

export type RpcClient = {
  rpc: (
    name: string,
    payload: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
};

export type ProjectSnapshot = {
  projectId: string;
  expectedVersion: number;
  projectName: string;
  summary: string;
  messages: Array<{
    id: string;
    role: "user" | "assistant";
    content: string;
    created_at: string;
    turn_id: string;
    sequence: number;
  }>;
  files: Array<{ path: string; content: string }>;
  run: Record<string, unknown>;
};

export type PersistedProjectBundle = {
  project: {
    id: string;
    name: string;
    summary: string;
    current_version: number;
    created_at: string;
    updated_at: string;
  };
  messages: Array<{
    id: string;
    role: "user" | "assistant";
    content: string;
    turn_id: string;
    created_at: string;
  }>;
  files: Array<{ path: string; content: string }>;
  runs: Array<{
    id: string;
    mode: "create" | "modify";
    requirement: string;
    status: "running" | "completed" | "failed";
    model: string | null;
    summary: string | null;
    events: ProjectTurn["events"];
    changed_files: string[] | null;
    deleted_files: string[] | null;
    build_attempts: number | null;
    version: number | null;
    error: string | null;
    started_at: string;
    completed_at: string | null;
  }>;
};

export type InsertClient = AuthClient & {
  from: (table: string) => {
    insert: (value: Record<string, unknown>) => PromiseLike<{ error: { message: string } | null }>;
  };
};

export type ProjectAccessClient = {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        single: () => PromiseLike<{
          data: { id: string; current_version: number } | null;
          error: { message: string } | null;
        }>;
      };
    };
  };
};

type QueryResult = PromiseLike<{ data: unknown; error: { message: string } | null }>;

type ReadQuery = {
  select: (columns?: string) => ReadQuery;
  eq: (column: string, value: string) => ReadQuery;
  order: (column: string, options: { ascending: boolean }) => QueryResult;
  single: () => QueryResult;
};

export type ProjectQueryClient = { from: (table: string) => ReadQuery };
export type ProjectStoreClient = AuthClient & RpcClient & InsertClient & ProjectAccessClient & ProjectQueryClient;

export async function requireAuthenticatedUser(client: AuthClient) {
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) throw new Error("请先登录后再访问项目。");
  return data.user;
}

export async function saveProjectSnapshot(client: RpcClient, snapshot: ProjectSnapshot) {
  const { data, error } = await client.rpc("save_project_version", {
    p_project_id: snapshot.projectId,
    p_expected_version: snapshot.expectedVersion,
    p_project_name: snapshot.projectName,
    p_summary: snapshot.summary,
    p_messages: snapshot.messages,
    p_files: snapshot.files,
    p_run: snapshot.run,
  });
  if (error) throw new Error(`项目保存失败：${error.message}`);
  if (typeof data !== "number") throw new Error("项目保存失败：数据库没有返回有效版本号。");
  return data;
}

export async function createProjectDraft(
  client: InsertClient,
  input: { projectId: string; name: string },
) {
  const user = await requireAuthenticatedUser(client);
  const { error } = await client.from("projects").insert({
    id: input.projectId,
    owner_id: user.id,
    name: input.name,
    summary: "",
    current_version: 0,
  });
  if (error) throw new Error(`项目初始化保存失败：${error.message}`);
}

export async function requireProjectAccess(client: ProjectAccessClient, projectId: string) {
  const { data, error } = await client
    .from("projects")
    .select("id,current_version")
    .eq("id", projectId)
    .single();
  if (error || !data) throw new Error("项目不存在或你无权访问。");
  return { projectId: data.id, currentVersion: data.current_version };
}

export function projectSnapshotFromState(
  state: ProjectState,
  project: GeneratedProject,
  turn: ProjectTurn,
  expectedVersion: number,
): ProjectSnapshot {
  return {
    projectId: state.projectId,
    expectedVersion,
    projectName: project.projectName,
    summary: project.summary,
    messages: state.messages.map((message, sequence) => ({
      id: message.id,
      role: message.role,
      content: message.content,
      turn_id: message.turnId,
      created_at: message.createdAt,
      sequence,
    })),
    files: project.files,
    run: {
      id: turn.id,
      mode: turn.mode,
      requirement: turn.requirement,
      status: turn.status,
      model: turn.model ?? null,
      summary: turn.summary ?? null,
      events: turn.events,
      changedFiles: turn.changedFiles ?? [],
      deletedFiles: turn.deletedFiles ?? [],
      buildAttempts: turn.buildAttempts ?? null,
      version: turn.version ?? null,
      error: turn.error ?? null,
      startedAt: turn.startedAt,
      completedAt: turn.completedAt ?? null,
    },
  };
}

export function persistedBundleToRuntime(bundle: PersistedProjectBundle) {
  const state: ProjectState = {
    projectId: bundle.project.id,
    projectName: bundle.project.name,
    summary: bundle.project.summary,
    currentVersion: bundle.project.current_version,
    createdAt: bundle.project.created_at,
    updatedAt: bundle.project.updated_at,
    messages: bundle.messages.map((message) => ({
      id: message.id,
      role: message.role,
      content: message.content,
      turnId: message.turn_id,
      createdAt: message.created_at,
    })),
    turns: bundle.runs.map((run) => ({
      id: run.id,
      mode: run.mode,
      requirement: run.requirement,
      status: run.status,
      startedAt: run.started_at,
      completedAt: run.completed_at ?? undefined,
      model: run.model ?? undefined,
      summary: run.summary ?? undefined,
      changedFiles: run.changed_files ?? [],
      deletedFiles: run.deleted_files ?? [],
      buildAttempts: run.build_attempts ?? undefined,
      version: run.version ?? undefined,
      error: run.error ?? undefined,
      events: run.events,
    })),
  };
  const project: GeneratedProject = {
    projectName: bundle.project.name,
    summary: bundle.project.summary,
    files: [...bundle.files].sort((left, right) => left.path.localeCompare(right.path)),
  };
  return { state, project };
}

export async function listUserProjects(client: ProjectQueryClient) {
  const { data, error } = await client
    .from("projects")
    .select("id,name,summary,current_version,created_at,updated_at,versions:project_versions(version,name,summary,created_at)")
    .order("updated_at", { ascending: false });
  if (error) throw new Error(`历史项目读取失败：${error.message}`);
  const projects = (data ?? []) as Array<PersistedProjectBundle["project"] & {
    versions?: Array<{ version: number; name: string; summary: string; created_at: string }>;
  }>;
  return projects.filter((project) => project.current_version > 0).map((project) => ({
    ...project,
    versions: [...(project.versions ?? [])].sort((left, right) => right.version - left.version),
  }));
}

export async function loadPersistedProject(client: ProjectQueryClient, projectId: string) {
  const [projectResult, messagesResult, filesResult, runsResult] = await Promise.all([
    client
      .from("projects")
      .select("id,name,summary,current_version,created_at,updated_at")
      .eq("id", projectId)
      .single(),
    client
      .from("messages")
      .select("id,role,content,turn_id,created_at,sequence")
      .eq("project_id", projectId)
      .order("sequence", { ascending: true }),
    client
      .from("project_files")
      .select("path,content")
      .eq("project_id", projectId)
      .order("path", { ascending: true }),
    client
      .from("agent_runs")
      .select("id,mode,requirement,status,model,summary,events,changed_files,deleted_files,build_attempts,version,error,started_at,completed_at")
      .eq("project_id", projectId)
      .order("started_at", { ascending: true }),
  ]);
  const failed = [projectResult, messagesResult, filesResult, runsResult].find((result) => result.error);
  if (failed?.error) throw new Error(`项目恢复读取失败：${failed.error.message}`);
  if (!projectResult.data) throw new Error("项目不存在或你无权访问。");
  return {
    project: projectResult.data,
    messages: messagesResult.data ?? [],
    files: filesResult.data ?? [],
    runs: runsResult.data ?? [],
  } as PersistedProjectBundle;
}

export async function loadProjectVersion(client: ProjectQueryClient, projectId: string, version: number) {
  const { data, error } = await client.from("project_versions")
    .select("version,name,summary,files")
    .eq("project_id", projectId).eq("version", String(version)).single();
  if (error || !data) throw new Error("历史版本不存在或你无权访问。");
  const snapshot = data as { version: number; name: string; summary: string; files: GeneratedProject["files"] };
  return { projectName: snapshot.name, summary: snapshot.summary, files: snapshot.files };
}

export async function confirmRestoredVersion(client: ProjectQueryClient & ProjectAccessClient, projectId: string, turnId: string, version: number) {
  const { data, error } = await client.from("agent_runs").select("id,version")
    .eq("project_id", projectId).eq("id", turnId).single();
  if (error && (error as { code?: string }).code !== "PGRST116") throw new Error("无法确认任务保存结果。");
  if (!data) return false;
  const run = data as { id: string; version: number };
  const current = await requireProjectAccess(client, projectId);
  return run.id === turnId && run.version === version && current.currentVersion === version;
}
