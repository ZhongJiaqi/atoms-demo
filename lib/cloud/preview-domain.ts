export const ATOMS_VERCEL_PROJECT_ID = "prj_Qy0ugq79jGkv9gAGc1vVeNtMpdkm";
export const ATOMS_VERCEL_TEAM_ID = "team_t41qF1poOXtcPYCh009TSUpt";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function previewHost(projectId: string): string {
  if (!uuid.test(projectId)) throw new Error("预览项目必须使用完整 UUID");
  return `atoms-app-${projectId}.vercel.app`;
}

export function previewOrigin(projectId: string): string {
  return `https://${previewHost(projectId)}`;
}

type AliasOptions = { token?: string; fetch?: typeof fetch };

// Runtime checks existing bindings only; it never creates or reassigns an alias.
export function ensurePreviewAlias(projectId: string, deploymentId: string, options: AliasOptions = {}): Promise<string> {
  return resolvePreviewAlias(projectId, deploymentId, options, false);
}

// Control-plane operations only, after independently verifying the management token
// is restricted to the Atoms project. GET then POST is not atomic: these ownership
// checks cannot prevent a concurrent reassignment. Do not wire this into runtime
// requests before the actual token's cross-project denial is verified. Sandbox
// OIDC credentials are distinct from these management access tokens.
export function bindPreviewAlias(projectId: string, deploymentId: string, options: AliasOptions = {}): Promise<string> {
  return resolvePreviewAlias(projectId, deploymentId, options, true);
}

async function resolvePreviewAlias(projectId: string, deploymentId: string, options: AliasOptions, bind: boolean): Promise<string> {
  if (typeof window !== "undefined") throw new Error("预览域名管理仅允许服务端调用");
  const host = previewHost(projectId);
  if (!/^dpl_[A-Za-z0-9]+$/.test(deploymentId)) throw new Error("必须提供明确的部署 ID");
  const token = options.token ?? process.env.ATOMS_VERCEL_API_TOKEN;
  if (!token) throw new Error("缺少 ATOMS_VERCEL_API_TOKEN");
  const request = options.fetch ?? fetch;
  async function api(path: string, method = "GET", body?: unknown) {
    const response = await request(`https://api.vercel.com${path}?teamId=${ATOMS_VERCEL_TEAM_ID}`, {
      method, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}), redirect: "error", signal: AbortSignal.timeout(15000),
    });
    if (!response.ok && !(method === "GET" && path.startsWith("/v4/aliases/") && response.status === 404)) {
      throw new Error(`预览域名管理失败（HTTP ${response.status}）`);
    }
    return response;
  }
  const deployment = await (await api(`/v13/deployments/${deploymentId}`)).json();
  if (deployment.id !== deploymentId || deployment.projectId !== ATOMS_VERCEL_PROJECT_ID || deployment.readyState !== "READY") {
    throw new Error("目标部署未就绪或不属于 Atoms 项目");
  }
  function checkAlias(value: { alias?: string; projectId?: string; deploymentId?: string; redirect?: unknown }) {
    if (!value || value.alias !== host || value.projectId !== ATOMS_VERCEL_PROJECT_ID || (value.redirect !== undefined && value.redirect !== null)) {
      throw new Error("预览域名归属不匹配，拒绝占用");
    }
  }
  const path = `/v4/aliases/${host}`;
  const current = await api(path);
  if (current.ok) {
    const alias = await current.json();
    checkAlias(alias);
    if (alias.deploymentId === deploymentId) return previewOrigin(projectId);
  }
  if (!bind) throw new Error("预览域名尚未绑定目标部署，请先完成控制面配置");
  const assigned = await (await api(`/v2/deployments/${deploymentId}/aliases`, "POST", { alias: host })).json();
  if (!assigned || assigned.alias !== host || typeof assigned.uid !== "string") throw new Error("预览域名绑定响应无效");
  const confirmed = await api(path);
  if (!confirmed.ok) throw new Error("预览域名绑定后无法核验");
  const alias = await confirmed.json();
  checkAlias(alias);
  if (alias.deploymentId !== deploymentId) throw new Error("预览域名未指向目标部署");
  return previewOrigin(projectId);
}
