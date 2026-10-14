import { createHmac, timingSafeEqual } from "node:crypto";
import { previewHost } from "./preview-domain.ts";

export interface PreviewGrant {
  projectId: string;
  version: number;
  artifactPath: string;
  signedArtifactUrl: string;
  host: string;
  issuedAt: number;
  expiresAt: number;
}
type GrantInput = Pick<PreviewGrant, "projectId" | "version" | "artifactPath" | "signedArtifactUrl">;
type Options = { secret?: string; nowSeconds?: number; ttlSeconds?: number };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const fields = ["projectId", "version", "artifactPath", "signedArtifactUrl", "host", "issuedAt", "expiresAt"];

function settings(options: Options) {
  if (typeof window !== "undefined") throw new Error("预览签名仅允许服务端调用");
  const secret = options.secret ?? process.env.ATOMS_PREVIEW_GRANT_SECRET;
  if (!secret || Buffer.byteLength(secret) < 32) throw new Error("预览签名密钥必须至少 32 字节");
  const now = options.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (!Number.isSafeInteger(now) || now < 0) throw new Error("预览时间无效");
  return { secret, now };
}

function validate(value: unknown): asserts value is PreviewGrant {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("预览能力无效");
  const grant = value as PreviewGrant;
  const keys = Object.keys(value);
  if (keys.length !== fields.length || keys.some(key => !fields.includes(key))) throw new Error("预览能力字段无效");
  if (typeof grant.projectId !== "string" || grant.host !== previewHost(grant.projectId) || !Number.isSafeInteger(grant.version) || grant.version < 1) throw new Error("预览项目或版本无效");
  if (typeof grant.artifactPath !== "string") throw new Error("预览产物路径无效");
  const parts = grant.artifactPath.split("/");
  if (parts.length !== 3 || !uuid.test(parts[0]) || parts[1] !== grant.projectId || !parts[2].endsWith(".json") || !uuid.test(parts[2].slice(0, -5))) throw new Error("预览产物路径无效");
  if (!Number.isSafeInteger(grant.issuedAt) || grant.issuedAt < 0 || !Number.isSafeInteger(grant.expiresAt) || grant.expiresAt <= grant.issuedAt || grant.expiresAt - grant.issuedAt > 300) throw new Error("预览能力有效期无效");
  if (typeof grant.signedArtifactUrl !== "string" || grant.signedArtifactUrl.length > 4096) throw new Error("预览产物签名链接无效");
  let url: URL;
  try { url = new URL(grant.signedArtifactUrl); }
  catch { throw new Error("预览产物签名链接无效"); }
  let path: string;
  try { path = decodeURIComponent(url.pathname); }
  catch { throw new Error("预览产物签名链接无效"); }
  if (url.origin !== "https://jvnweimexkigooqvagfz.supabase.co" || url.username || url.password || url.hash ||
      path !== `/storage/v1/object/sign/atoms-artifacts/${grant.artifactPath}` ||
      [...url.searchParams.keys()].length !== 1 || !url.searchParams.get("token")) throw new Error("预览产物签名链接无效");
}

export function createPreviewGrant(input: GrantInput, options: Options = {}): string {
  const { secret, now } = settings(options);
  const ttl = options.ttlSeconds ?? 300;
  if (!Number.isInteger(ttl) || ttl < 1 || ttl > 300) throw new Error("预览能力有效期必须在 1–300 秒之间");
  const grant = { ...input, host: previewHost(input.projectId), issuedAt: now, expiresAt: now + ttl };
  validate(grant);
  const body = Buffer.from(JSON.stringify(grant)).toString("base64url");
  return `${body}.${createHmac("sha256", secret).update(body).digest("base64url")}`;
}

export function verifyPreviewGrant(token: string, expected: { host: string; projectId: string }, options: Options = {}): PreviewGrant {
  const { secret, now } = settings(options);
  if (typeof token !== "string" || token.length > 8192 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/.test(token)) throw new Error("预览能力签名无效");
  const [body, signature] = token.split(".");
  const actual = Buffer.from(signature, "base64url");
  const wanted = createHmac("sha256", secret).update(body).digest();
  if (actual.length !== wanted.length || !timingSafeEqual(actual, wanted) || actual.toString("base64url") !== signature) throw new Error("预览能力签名无效");
  let grant: unknown;
  try { grant = JSON.parse(Buffer.from(body, "base64url").toString("utf8")); }
  catch { throw new Error("预览能力无效"); }
  validate(grant);
  if (expected.host !== grant.host || expected.projectId !== grant.projectId || grant.issuedAt > now || grant.expiresAt <= now) throw new Error("预览能力已失效或不属于当前项目域名");
  return grant;
}
