import { randomUUID } from "node:crypto";
import type { ProjectSnapshot } from "../persistence/project-store.ts";

interface LeaseClient {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message: string } | null }>;
}
export interface ProjectLease { projectId: string; token: string; ttlSeconds: number }
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function validate(lease: ProjectLease): void {
  if (!uuid.test(lease.projectId) || !uuid.test(lease.token)) throw new Error("项目租约必须使用 UUID");
  if (!Number.isInteger(lease.ttlSeconds) || lease.ttlSeconds < 300 || lease.ttlSeconds > 1800) throw new Error("租约有效期必须在 300–1800 秒之间");
}

export async function acquireProjectLease(client: LeaseClient, projectId: string, ttlSeconds = 900, token = randomUUID()): Promise<ProjectLease> {
  const lease = { projectId, token, ttlSeconds };
  validate(lease);
  const { data, error } = await client.rpc("acquire_project_lease", { p_project_id: projectId, p_token: token, p_ttl_seconds: ttlSeconds });
  if (error) throw new Error(`获取项目租约失败：${error.message}`);
  if (data !== true) throw new Error("项目正在处理其他任务，请稍后重试");
  return lease;
}

export async function renewProjectLease(client: LeaseClient, lease: ProjectLease): Promise<void> {
  validate(lease);
  const { data, error } = await client.rpc("renew_project_lease", { p_project_id: lease.projectId, p_token: lease.token, p_ttl_seconds: lease.ttlSeconds });
  if (error) throw new Error(`续期项目租约失败：${error.message}`);
  if (data !== true) throw new Error("项目租约已失效，无法继续处理");
}

export async function releaseProjectLease(client: LeaseClient, lease: ProjectLease): Promise<void> {
  validate(lease);
  const { data, error } = await client.rpc("release_project_lease", { p_project_id: lease.projectId, p_token: lease.token });
  if (error) throw new Error(`释放项目租约失败：${error.message}`);
  if (data !== true) throw new Error("释放项目租约失败：令牌已失效");
}

export async function withProjectLease<T>(client: LeaseClient, projectId: string, operation: (lease: ProjectLease, signal: AbortSignal) => Promise<T>, options: { deadlineMs?: number; onCleanupError?: (error: unknown) => void } = {}): Promise<T> {
  const deadlineMs = options.deadlineMs ?? 240000;
  if (!Number.isInteger(deadlineMs) || deadlineMs < 1 || deadlineMs > 240000) throw new Error("任务硬截止时间必须在 1–240000 毫秒之间");
  const lease = await acquireProjectLease(client, projectId);
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let operationFailed = false;
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      const error = new Error("项目任务超时，请重新尝试");
      controller.abort(error);
      reject(error);
    }, deadlineMs);
  });
  try {
    // race 只停止等待；忽略 signal 的任务可能继续运行，提交必须使用租约校验 RPC。
    return await Promise.race([Promise.resolve().then(() => operation(lease, controller.signal)), deadline]);
  } catch (error) {
    operationFailed = true;
    throw error;
  } finally {
    clearTimeout(timer);
    try { await releaseProjectLease(client, lease); }
    catch (error) {
      if (!operationFailed) throw error;
      try {
        if (options.onCleanupError) options.onCleanupError(error);
        else console.error("项目租约清理失败", error instanceof Error ? error.message : "未知错误");
      } catch { /* 清理记录故障不得覆盖原始任务错误。 */ }
    }
  }
}

export async function saveCloudProjectSnapshot(client: LeaseClient, lease: ProjectLease, snapshot: ProjectSnapshot): Promise<number> {
  validate(lease);
  if (snapshot.projectId !== lease.projectId) throw new Error("云快照项目与租约不一致");
  const { data, error } = await client.rpc("save_cloud_project_version", {
    p_project_id: snapshot.projectId,
    p_lease_token: lease.token,
    p_expected_version: snapshot.expectedVersion,
    p_project_name: snapshot.projectName,
    p_summary: snapshot.summary,
    p_messages: snapshot.messages,
    p_files: snapshot.files,
    p_run: snapshot.run,
  });
  if (error) throw new Error(`云项目保存失败：${error.message}`);
  if (typeof data !== "number" || !Number.isInteger(data) || data < 1) throw new Error("云项目保存失败：数据库没有返回有效版本号");
  return data;
}
