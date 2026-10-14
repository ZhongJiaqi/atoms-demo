import { createHash, timingSafeEqual } from "node:crypto";

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

// The deny-project must be independently confirmed to exist in the same Atoms
// team by the control plane, so team-wide tokens cannot pass this probe.
// A 404 alone is not proof: current-token metadata must confirm project scope,
// or trusted deployment setup must have verified unique owner token metadata and
// the user's original token provenance before installing its SHA-256 fingerprint.
// The fingerprint proves token identity, not project scope by itself.
// Recheck with the same token before binding; platform project permissions, not
// our non-atomic GET, constrain writes.
export async function ensureScopedPreviewAlias(projectId: string, deploymentId: string, options: AliasOptions = {}): Promise<string> {
  if (typeof window !== "undefined") throw new Error("预览域名管理仅允许服务端调用");
  previewHost(projectId);
  if (!/^dpl_[A-Za-z0-9]+$/.test(deploymentId)) throw new Error("必须提供明确的部署 ID");
  const deniedProjectId = process.env.ATOMS_SCOPE_DENY_PROJECT_ID;
  if (!deniedProjectId || !/^prj_[A-Za-z0-9]+$/.test(deniedProjectId) || deniedProjectId === ATOMS_VERCEL_PROJECT_ID) {
    throw new Error("必须配置独立确认存在的 ATOMS_SCOPE_DENY_PROJECT_ID");
  }
  const token = options.token ?? process.env.ATOMS_VERCEL_API_TOKEN;
  if (!token) throw new Error("缺少 ATOMS_VERCEL_API_TOKEN");
  const fingerprint = process.env.ATOMS_VERCEL_TOKEN_SHA256;
  if (fingerprint !== undefined) {
    if (!/^[0-9a-fA-F]{64}$/.test(fingerprint) ||
        !timingSafeEqual(createHash("sha256").update(token).digest(), Buffer.from(fingerprint, "hex"))) {
      throw new Error("管理凭据与可信部署指纹不匹配，禁止自动绑定预览域名");
    }
  }
  const request = options.fetch ?? fetch;
  const readProject = (id: string) => request(`https://api.vercel.com/v9/projects/${id}?teamId=${ATOMS_VERCEL_TEAM_ID}`, {
    method: "GET", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    redirect: "error", signal: AbortSignal.timeout(15000),
  });
  const own = await readProject(ATOMS_VERCEL_PROJECT_ID);
  if (own.status !== 200 || (await own.json())?.id !== ATOMS_VERCEL_PROJECT_ID) throw new Error("管理凭据不能确认 Atoms 项目权限");
  const foreign = await readProject(deniedProjectId);
  if (foreign.status === 404 && fingerprint === undefined) {
    const response = await request("https://api.vercel.com/v5/user/tokens/current", {
      method: "GET", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      redirect: "error", signal: AbortSignal.timeout(15000),
    });
    if (response.status !== 200) throw new Error(`无法验证当前管理凭据元数据（HTTP ${response.status}），禁止自动绑定预览域名`);
    let metadata;
    try { metadata = (await response.json())?.token; }
    catch { throw new Error("当前管理凭据元数据无效，禁止自动绑定预览域名"); }
    const expiry = metadata?.expiresAt;
    if (!metadata || metadata.projectId !== ATOMS_VERCEL_PROJECT_ID || metadata.revokedAt != null || metadata.leakedAt != null ||
        (expiry != null && (!["number", "string"].includes(typeof expiry) || !Number.isSafeInteger(Number(expiry)) || Number(expiry) <= Date.now()))) {
      throw new Error("当前管理凭据未限定有效的 Atoms 项目权限，禁止自动绑定预览域名");
    }
  } else if (foreign.status !== 403 && foreign.status !== 404) {
    throw new Error(`管理凭据未证明拒绝其他项目（HTTP ${foreign.status}），禁止自动绑定预览域名`);
  }
  return bindPreviewAlias(projectId, deploymentId, { token, fetch: request });
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
    if (!response.ok && !(method === "GET" && response.status === 404 &&
        (path.startsWith("/v4/aliases/") || path.startsWith(`/v9/projects/${ATOMS_VERCEL_PROJECT_ID}/domains/`)))) {
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
  let currentAlias;
  if (current.ok) {
    currentAlias = await current.json();
    checkAlias(currentAlias);
  }
  if (!bind && currentAlias?.deploymentId !== deploymentId) throw new Error("预览域名尚未绑定目标部署，请先完成控制面配置");
  function checkProductionDomain(value: { name?: string; projectId?: string; verified?: boolean; gitBranch?: unknown; customEnvironmentId?: unknown; redirect?: unknown }) {
    if (!value || value.name !== host || value.projectId !== ATOMS_VERCEL_PROJECT_ID || value.verified !== true ||
        value.gitBranch != null || value.customEnvironmentId != null || value.redirect != null) {
      throw new Error("预览域名未验证为 Atoms production domain，拒绝就绪");
    }
  }
  const domainPath = `/v9/projects/${ATOMS_VERCEL_PROJECT_ID}/domains/${host}`;
  let domain = await api(domainPath);
  if (!domain.ok) {
    if (!bind) throw new Error("预览域名尚未登记 Atoms production domain");
    const registered = await (await api(`/v10/projects/${ATOMS_VERCEL_PROJECT_ID}/domains`, "POST", { name: host })).json();
    checkProductionDomain(registered);
    domain = await api(domainPath);
    if (!domain.ok) throw new Error("预览域名登记后无法核验");
    checkProductionDomain(await domain.json());
    // Registration can automatically alias the latest production deployment.
    // Re-read instead of trusting the alias captured before registration.
    const reassigned = await api(path);
    currentAlias = reassigned.ok ? await reassigned.json() : undefined;
    if (currentAlias) checkAlias(currentAlias);
  } else {
    checkProductionDomain(await domain.json());
  }
  if (currentAlias?.deploymentId === deploymentId) return previewOrigin(projectId);
  const assigned = await (await api(`/v2/deployments/${deploymentId}/aliases`, "POST", { alias: host })).json();
  if (!assigned || assigned.alias !== host || typeof assigned.uid !== "string") throw new Error("预览域名绑定响应无效");
  const confirmed = await api(path);
  if (!confirmed.ok) throw new Error("预览域名绑定后无法核验");
  const alias = await confirmed.json();
  checkAlias(alias);
  if (alias.deploymentId !== deploymentId) throw new Error("预览域名未指向目标部署");
  return previewOrigin(projectId);
}
