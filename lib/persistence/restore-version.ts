import { randomUUID } from "node:crypto";
import type { GeneratedProject, ProjectState, ProjectTurn } from "../agent/types";

type RestoreInput = { state: ProjectState; project: GeneratedProject; targetVersion: number; expectedVersion: number };
type RestoreOperations<T> = {
  stage: (state: ProjectState, project: GeneratedProject) => Promise<T>;
  save: (state: ProjectState, project: GeneratedProject, turn: ProjectTurn, expectedVersion: number) => Promise<number>;
  activate: (staging: T) => void | Promise<void>;
  discard: (staging: T) => Promise<void>;
  finalize?: (staging: T, state: ProjectState) => Promise<void>;
  isCommitted?: (turnId: string, version: number) => Promise<boolean>;
};

export async function restoreProjectVersion<T>(input: RestoreInput, operations: RestoreOperations<T>) {
  if (input.state.currentVersion !== input.expectedVersion) throw new Error("项目版本已变化，请刷新后重试。");
  if (!Number.isInteger(input.targetVersion) || input.targetVersion < 1 || input.targetVersion >= input.expectedVersion) {
    throw new Error("只能恢复已有的历史版本。");
  }
  const state = structuredClone(input.state);
  const project = structuredClone(input.project);
  const at = new Date().toISOString();
  const summary = `恢复到 v${input.targetVersion}：${project.summary}`;
  const turn: ProjectTurn = {
    id: randomUUID(), mode: "modify", requirement: `恢复到版本 v${input.targetVersion}`,
    status: "completed", startedAt: at, completedAt: at, model: "历史版本恢复",
    summary, version: input.expectedVersion + 1, buildAttempts: 1,
    changedFiles: project.files.map((file) => file.path), deletedFiles: [],
    events: [{ event: "project_loaded", data: { message: `从云端读取 v${input.targetVersion} 代码快照` }, at }],
  };
  project.summary = summary;
  state.currentVersion = turn.version!;
  state.projectName = project.projectName;
  state.summary = summary;
  state.updatedAt = at;
  state.messages.push(
    { id: randomUUID(), role: "user", content: turn.requirement, createdAt: at, turnId: turn.id },
    { id: randomUUID(), role: "assistant", content: summary, createdAt: at, turnId: turn.id },
  );
  state.turns.push(turn);
  const staged = await operations.stage(state, project);
  let saveStarted = false;
  try {
    turn.events.push({ event: "complete", data: { message: summary, version: turn.version, restoredFrom: input.targetVersion }, at: new Date().toISOString() });
    await operations.finalize?.(staged, state);
    saveStarted = true;
    const savedVersion = await operations.save(state, project, turn, input.expectedVersion);
    if (savedVersion !== state.currentVersion) throw new Error("恢复保存返回的版本号不一致。");
  } catch (error) {
    let committed = false;
    try { committed = saveStarted && Boolean(await operations.isCommitted?.(turn.id, state.currentVersion)); }
    catch {
      await operations.discard(staged);
      throw new Error("保存结果暂时无法确认，请刷新项目后再操作。");
    }
    if (!committed) {
      await operations.discard(staged);
      throw error;
    }
  }
  await operations.activate(staged);
  return { state, project, turn };
}
