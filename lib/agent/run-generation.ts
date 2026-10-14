import { randomUUID } from "node:crypto";

import { generateProject, modifyProject, repairProject, repairProjectPatch } from "./model.ts";
import {
  loadGeneratedProject,
  loadProjectState,
  mergeProjectPatch,
  prepareProjectDirectory,
  resolveProjectDirectory,
  saveBuildLog,
  saveProjectState,
  snapshotProjectVersion,
  validateProject,
  writeGeneratedFiles,
  writeProjectPatch,
} from "./files.ts";
import type { AgentEvent, GeneratedProject, ProjectState, ProjectTurn } from "./types";
import { buildProject, getProjectRuntimeDirectory, startPreview } from "../sandbox/local-sandbox.ts";
import { previewUrl } from "../preview-url.ts";

const MAX_REPAIR_ROUNDS = 2;

export type GenerationRuntime = {
  projectId: string;
  root: string;
  build: typeof buildProject;
  load: (projectId: string) => Promise<{ projectDir: string; state: ProjectState; project: GeneratedProject }>;
  publish: (projectId: string, projectDir: string, turnId: string, version: number) => Promise<{ artifactPath: string; previewReady: boolean; previewUrl?: string }>;
};

export type GenerationPersistence = {
  createDraft: (projectId: string) => Promise<void>;
  saveVersion: (
    state: ProjectState,
    project: GeneratedProject,
    turn: ProjectTurn,
    expectedVersion: number,
  ) => Promise<number>;
};

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "未知错误";
}

function buildLog(result: Awaited<ReturnType<typeof buildProject>>) {
  const flags = [
    result.signal ? `沙盒进程被信号 ${result.signal} 终止。` : "",
    result.exitCode !== null && result.exitCode !== 0 ? `沙盒进程退出码：${result.exitCode}。` : "",
    result.timedOut ? "构建超过 40 秒硬超时。" : "",
    result.resourceExceeded ? "构建超过 640 MB 内存上限。" : "",
  ]
    .filter(Boolean)
    .join("\n");
  return [flags, result.stdout, result.stderr].filter(Boolean).join("\n").slice(-24_000);
}

function eventRecorder(turn: ProjectTurn, emit: (event: AgentEvent) => void) {
  return (event: AgentEvent) => {
    turn.events.push({ ...event, at: new Date().toISOString() });
    emit(event);
  };
}

async function restoreLastWorkingVersion(projectDir: string, project: GeneratedProject) {
  await writeGeneratedFiles(projectDir, project);
  const restore = await buildProject(projectDir);
  if (!restore.success) {
    throw new Error(`恢复上一成功版本时构建失败：${buildLog(restore).slice(-4000)}`);
  }
}

async function runCreation(
  requirement: string,
  origin: string,
  emit: (event: AgentEvent) => void,
  persistence: GenerationPersistence,
  runtime?: GenerationRuntime,
) {
  const projectId = runtime?.projectId ?? randomUUID();
  const turnId = randomUUID();
  const startedAt = new Date().toISOString();
  const turn: ProjectTurn = {
    id: turnId,
    mode: "create",
    requirement,
    status: "running",
    startedAt,
    events: [],
  };
  const send = eventRecorder(turn, emit);
  let projectDir: string | null = null;
  let current: GeneratedProject | null = null;
  let model = "";
  let finalAttempt = 0;

  try {
    await persistence.createDraft(projectId);
    send({ event: "accepted", data: { projectId, turnId, mode: "create", message: "已创建独立项目" } });
    send({ event: "model_started", data: { message: "正在调用真实模型生成 React 项目" } });
    const generated = await generateProject(requirement);
    current = generated.project;
    model = generated.model;
    send({
      event: "model_completed",
      data: { model, projectName: current.projectName, files: current.files.map((file) => file.path) },
    });

    for (let attempt = 1; attempt <= MAX_REPAIR_ROUNDS + 1; attempt += 1) {
      finalAttempt = attempt;
      let failureLog = "";
      try {
        validateProject(current);
        if (!projectDir) {
          projectDir = await prepareProjectDirectory(projectId, requirement, current, runtime?.root);
          send({
            event: "files_saved",
            data: {
              projectId,
              files: current.files.map((file) => file.path),
              message: `已保存 ${current.files.length} 个生成文件`,
            },
          });
        } else {
          await writeGeneratedFiles(projectDir, current);
        }

        send({ event: "build_started", data: { attempt, message: `开始第 ${attempt} 次受控构建` } });
        const result = await (runtime?.build ?? buildProject)(projectDir);
        failureLog = buildLog(result);
        await saveBuildLog(projectDir, turnId, attempt, failureLog || "构建成功，无错误日志。\n");
        if (result.success) break;
      } catch (error) {
        failureLog = `文件校验或沙盒执行失败：${errorMessage(error)}`;
        if (projectDir) await saveBuildLog(projectDir, turnId, attempt, failureLog);
      }

      send({
        event: "build_failed",
        data: { attempt, message: `第 ${attempt} 次构建失败`, log: failureLog.slice(-8000) },
      });
      if (attempt > MAX_REPAIR_ROUNDS) {
        throw new Error(`构建在 ${MAX_REPAIR_ROUNDS} 轮自动修复后仍失败。`);
      }

      send({
        event: "repair_started",
        data: { round: attempt, message: `模型正在读取日志并执行第 ${attempt} 轮修复` },
      });
      const repaired = await repairProject(requirement, current, failureLog, attempt);
      current = repaired.project;
      send({
        event: "repair_completed",
        data: { round: attempt, model: repaired.model, files: current.files.map((file) => file.path) },
      });
    }

    if (!projectDir || !current) throw new Error("模型没有生成通过安全校验的项目文件。");
    await snapshotProjectVersion(projectDir, 1, current);
    send({ event: "preview_started", data: { message: runtime ? "正在保存云端构建产物" : "正在受控沙盒中启动真实 Vite 预览" } });
    const preview = runtime
      ? await runtime.publish(projectId, projectDir, turnId, 1)
      : await startPreview(projectId, projectDir).then(() => ({ previewUrl: previewUrl(origin, projectId, 1) }));
    const complete: AgentEvent = {
      event: "complete",
      data: {
        mode: "create",
        version: 1,
        projectId,
        projectName: current.projectName,
        summary: current.summary,
        model,
        buildAttempts: finalAttempt,
        ...preview,
        generatedFiles: current.files.map((file) => file.path),
        changedFiles: current.files.map((file) => file.path),
        deletedFiles: [],
      },
    };
    const completedAt = new Date().toISOString();
    turn.status = "completed";
    turn.completedAt = completedAt;
    turn.model = model;
    turn.summary = current.summary;
    turn.changedFiles = current.files.map((file) => file.path);
    turn.deletedFiles = [];
    turn.buildAttempts = finalAttempt;
    turn.version = 1;
    const state: ProjectState = {
      projectId,
      projectName: current.projectName,
      summary: current.summary,
      currentVersion: 1,
      createdAt: startedAt,
      updatedAt: completedAt,
      messages: [
        { id: randomUUID(), role: "user", content: requirement, createdAt: startedAt, turnId },
        { id: randomUUID(), role: "assistant", content: current.summary, createdAt: completedAt, turnId },
      ],
      turns: [turn],
    };
    turn.events.push({ ...complete, at: completedAt });
    await saveProjectState(projectDir, state);
    await persistence.saveVersion(state, current, turn, 0);
    emit(complete);
  } catch (error) {
    if (projectDir && current) {
      const failedAt = new Date().toISOString();
      turn.status = "failed";
      turn.completedAt = failedAt;
      turn.model = model || undefined;
      turn.error = errorMessage(error);
      turn.buildAttempts = finalAttempt || undefined;
      turn.events.push({ event: "error", data: { message: turn.error }, at: failedAt });
      const failedState: ProjectState = {
        projectId,
        projectName: current.projectName,
        summary: current.summary,
        currentVersion: 0,
        createdAt: startedAt,
        updatedAt: failedAt,
        messages: [{ id: randomUUID(), role: "user", content: requirement, createdAt: startedAt, turnId }],
        turns: [turn],
      };
      await saveProjectState(projectDir, failedState).catch(() => undefined);
    }
    throw error;
  }
}

async function runModification(
  requirement: string,
  projectId: string,
  origin: string,
  emit: (event: AgentEvent) => void,
  persistence: GenerationPersistence,
  runtime?: GenerationRuntime,
) {
  const loaded = runtime ? await runtime.load(projectId) : null;
  const projectDir = loaded?.projectDir ?? getProjectRuntimeDirectory(projectId) ?? await resolveProjectDirectory(projectId);
  const state = loaded?.state ?? await loadProjectState(projectDir);
  if (state.projectId !== projectId || state.currentVersion < 1) {
    throw new Error("该项目没有可继续修改的成功版本。");
  }
  const baseProject = loaded?.project ?? await loadGeneratedProject(projectDir, state);
  const expectedVersion = state.currentVersion;
  let current = baseProject;
  const turnId = randomUUID();
  const startedAt = new Date().toISOString();
  const turn: ProjectTurn = {
    id: turnId,
    mode: "modify",
    requirement,
    status: "running",
    startedAt,
    events: [],
  };
  const send = eventRecorder(turn, emit);
  let finalAttempt = 0;
  let model = "";
  const allChanged = new Set<string>();
  const allDeleted = new Set<string>();

  state.messages.push({ id: randomUUID(), role: "user", content: requirement, createdAt: startedAt, turnId });
  state.turns.push(turn);
  state.updatedAt = startedAt;
  await saveProjectState(projectDir, state);

  try {
    send({ event: "accepted", data: { projectId, turnId, mode: "modify", message: `继续修改同一项目 · 版本 ${state.currentVersion}` } });
    send({
      event: "project_loaded",
      data: {
        projectId,
        version: state.currentVersion,
        files: current.files.map((file) => file.path),
        message: `已读取原项目 ${current.files.length} 个文件`,
      },
    });
    send({ event: "model_started", data: { message: "真实模型正在生成最小增量补丁" } });
    const modified = await modifyProject(
      requirement,
      current,
      state.turns.filter((item) => item.status === "completed").map((item) => item.requirement),
    );
    model = modified.model;
    let merged = mergeProjectPatch(current, modified.patch);
    current = merged.project;
    merged.changedFiles.forEach((path) => allChanged.add(path));
    merged.deletedFiles.forEach((path) => allDeleted.add(path));
    send({
      event: "model_completed",
      data: {
        model,
        projectName: current.projectName,
        files: merged.changedFiles,
        deletedFiles: merged.deletedFiles,
        message: `模型仅返回 ${merged.changedFiles.length + merged.deletedFiles.length} 个必要文件变化`,
      },
    });

    for (let attempt = 1; attempt <= MAX_REPAIR_ROUNDS + 1; attempt += 1) {
      finalAttempt = attempt;
      let failureLog = "";
      try {
        await writeProjectPatch(projectDir, current, merged.changedFiles, merged.deletedFiles);
        send({
          event: "files_saved",
          data: {
            projectId,
            files: merged.changedFiles,
            deletedFiles: merged.deletedFiles,
            message: `已增量写入 ${merged.changedFiles.length} 个文件，删除 ${merged.deletedFiles.length} 个文件`,
          },
        });
        send({ event: "build_started", data: { attempt, message: `在原项目目录执行第 ${attempt} 次受控构建` } });
        const result = await (runtime?.build ?? buildProject)(projectDir);
        failureLog = buildLog(result);
        await saveBuildLog(projectDir, turnId, attempt, failureLog || "构建成功，无错误日志。\n");
        if (result.success) break;
      } catch (error) {
        failureLog = `文件校验或沙盒执行失败：${errorMessage(error)}`;
        await saveBuildLog(projectDir, turnId, attempt, failureLog);
      }

      send({
        event: "build_failed",
        data: { attempt, message: `第 ${attempt} 次构建失败`, log: failureLog.slice(-8000) },
      });
      if (attempt > MAX_REPAIR_ROUNDS) {
        throw new Error(`构建在 ${MAX_REPAIR_ROUNDS} 轮自动修复后仍失败。`);
      }

      send({
        event: "repair_started",
        data: { round: attempt, message: `模型正在读取日志并执行第 ${attempt} 轮增量修复` },
      });
      const repaired = await repairProjectPatch(requirement, current, failureLog, attempt);
      merged = mergeProjectPatch(current, repaired.patch);
      current = merged.project;
      merged.changedFiles.forEach((path) => allChanged.add(path));
      merged.deletedFiles.forEach((path) => allDeleted.add(path));
      send({
        event: "repair_completed",
        data: { round: attempt, model: repaired.model, files: merged.changedFiles, deletedFiles: merged.deletedFiles },
      });
    }

    const version = state.currentVersion + 1;
    await snapshotProjectVersion(projectDir, version, current);
    send({ event: "preview_started", data: { message: runtime ? "正在保存云端构建产物" : "正在替换同一项目的真实 Vite 预览" } });
    const preview = runtime
      ? await runtime.publish(projectId, projectDir, turnId, version)
      : await startPreview(projectId, projectDir).then(() => ({ previewUrl: previewUrl(origin, projectId, version) }));
    const complete: AgentEvent = {
      event: "complete",
      data: {
        mode: "modify",
        version,
        projectId,
        projectName: current.projectName,
        summary: current.summary,
        model,
        buildAttempts: finalAttempt,
        ...preview,
        generatedFiles: current.files.map((file) => file.path),
        changedFiles: [...allChanged],
        deletedFiles: [...allDeleted],
      },
    };
    const completedAt = new Date().toISOString();
    turn.status = "completed";
    turn.completedAt = completedAt;
    turn.model = model;
    turn.summary = current.summary;
    turn.changedFiles = [...allChanged];
    turn.deletedFiles = [...allDeleted];
    turn.buildAttempts = finalAttempt;
    turn.version = version;
    state.projectName = current.projectName;
    state.summary = current.summary;
    state.currentVersion = version;
    state.updatedAt = completedAt;
    state.messages.push({
      id: randomUUID(),
      role: "assistant",
      content: current.summary,
      createdAt: completedAt,
      turnId,
    });
    turn.events.push({ ...complete, at: completedAt });
    await saveProjectState(projectDir, state);
    await persistence.saveVersion(state, current, turn, expectedVersion);
    emit(complete);
  } catch (error) {
    const failedAt = new Date().toISOString();
    let failure = errorMessage(error);
    try {
      if (!runtime) await restoreLastWorkingVersion(projectDir, baseProject);
    } catch (restoreError) {
      failure = `${failure}\n${errorMessage(restoreError)}`;
    }
    turn.status = "failed";
    turn.completedAt = failedAt;
    turn.model = model || undefined;
    turn.error = failure;
    turn.changedFiles = [...allChanged];
    turn.deletedFiles = [...allDeleted];
    turn.buildAttempts = finalAttempt || undefined;
    turn.events = turn.events.filter((item) => item.event !== "complete");
    turn.events.push({ event: "error", data: { message: failure }, at: failedAt });
    state.projectName = baseProject.projectName;
    state.summary = baseProject.summary;
    state.currentVersion = expectedVersion;
    state.messages = state.messages.filter((message) => message.role !== "assistant" || message.turnId !== turnId);
    state.updatedAt = failedAt;
    await saveProjectState(projectDir, state).catch(() => undefined);
    throw new Error(failure);
  }
}

export async function runGeneration(
  requirement: string,
  previewOrigin: string,
  emit: (event: AgentEvent) => void,
  persistence: GenerationPersistence,
  projectId?: string,
  runtime?: GenerationRuntime,
) {
  if (projectId) {
    await runModification(requirement, projectId, previewOrigin, emit, persistence, runtime);
    return;
  }
  await runCreation(requirement, previewOrigin, emit, persistence, runtime);
}
