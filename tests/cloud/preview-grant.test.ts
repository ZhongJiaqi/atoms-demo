import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";

const id = "123e4567-e89b-42d3-a456-426614174000";
const host = "atoms-app-123e4567-e89b-42d3-a456-426614174000.vercel.app";
const artifactPath = `223e4567-e89b-42d3-a456-426614174000/${id}/323e4567-e89b-42d3-a456-426614174000.json`;
const signedArtifactUrl = `https://jvnweimexkigooqvagfz.supabase.co/storage/v1/object/sign/atoms-artifacts/${artifactPath}?token=single-object-token`;
const input = { projectId: id, version: 4, artifactPath, signedArtifactUrl };
const secret = "test-secret-only-".repeat(4);
const options = { secret, nowSeconds: 1000, ttlSeconds: 300 };
async function subject() {
  const module = await import("../../lib/cloud/preview-grant.ts").catch(() => null);
  assert.ok(module, "缺少短期预览能力模块");
  return module;
}
function signed(payload: unknown) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${createHmac("sha256", secret).update(body).digest("base64url")}`;
}

test("grant绑定项目版本域名与单对象签名URL，300秒边界立即失效", async () => {
  const { createPreviewGrant, verifyPreviewGrant } = await subject();
  const token = createPreviewGrant(input, options);
  const grant = verifyPreviewGrant(token, { host, projectId: id }, { secret, nowSeconds: 1299 });
  assert.deepEqual(grant, { ...input, host, issuedAt: 1000, expiresAt: 1300 });
  assert.throws(() => verifyPreviewGrant(token, { host, projectId: id }, { secret, nowSeconds: 1300 }));
});

test("grant拒绝改payload、签名、其他密钥、其他项目与域名", async () => {
  const { createPreviewGrant, verifyPreviewGrant } = await subject();
  const token = createPreviewGrant(input, options);
  const [body, signature] = token.split(".");
  const altered = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(body, "base64url").toString()), version: 5 })).toString("base64url");
  for (const bad of [`${altered}.${signature}`, `${body}.${signature[0] === "A" ? "B" : "A"}${signature.slice(1)}`, `${body}.x`, `${token}.extra`]) {
    assert.throws(() => verifyPreviewGrant(bad, { host, projectId: id }, { secret, nowSeconds: 1001 }));
  }
  assert.throws(() => verifyPreviewGrant(token, { host, projectId: id }, { secret: "other-secret-".repeat(4), nowSeconds: 1001 }));
  assert.throws(() => verifyPreviewGrant(token, { host: "atoms-demo-jiaqi.vercel.app", projectId: id }, options));
  assert.throws(() => verifyPreviewGrant(token, { host, projectId: "423e4567-e89b-42d3-a456-426614174000" }, options));
});

test("grant只允许1到300秒整数TTL、正整数版本及本项目产物", async () => {
  const { createPreviewGrant } = await subject();
  for (const ttlSeconds of [0, 301, 1.5, NaN]) assert.throws(() => createPreviewGrant(input, { ...options, ttlSeconds }));
  for (const version of [0, -1, 1.5, NaN]) assert.throws(() => createPreviewGrant({ ...input, version }, options));
  assert.throws(() => createPreviewGrant({ ...input, artifactPath: artifactPath.replace(id, "423e4567-e89b-42d3-a456-426614174000") }, options));
  assert.throws(() => createPreviewGrant(input, { ...options, secret: "short" }));
});

test("grant拒绝URL外站、非HTTPS、路径不符与额外凭据参数", async () => {
  const { createPreviewGrant } = await subject();
  for (const url of [signedArtifactUrl.replace("jvnweimexkigooqvagfz.supabase.co", "evil.example"), signedArtifactUrl.replace("https:", "http:"), signedArtifactUrl.replace(id, "423e4567-e89b-42d3-a456-426614174000"), `${signedArtifactUrl}&redirect=https://evil.example`, `${signedArtifactUrl}#fragment`, signedArtifactUrl.replace("https://", "https://user:password@"), signedArtifactUrl.replace("?token=single-object-token", "?token=")]) {
    assert.throws(() => createPreviewGrant({ ...input, signedArtifactUrl: url }, options));
  }
});

test("verify签名后仍拒绝额外字段、非法URL及超过300秒的可信签名payload", async () => {
  const { verifyPreviewGrant } = await subject();
  const payload = { ...input, host, issuedAt: 1000, expiresAt: 1300 };
  for (const value of [{ ...payload, userJWT: "forbidden" }, { ...payload, signedArtifactUrl: "https://evil.example/object" }, { ...payload, expiresAt: 1301 }, { ...payload, issuedAt: 1002 }]) {
    assert.throws(() => verifyPreviewGrant(signed(value), { host, projectId: id }, { secret, nowSeconds: 1001 }));
  }
});

test("浏览器不能创建或验证服务端预览签名", async () => {
  const { createPreviewGrant, verifyPreviewGrant } = await subject();
  const token = createPreviewGrant(input, options);
  const previous = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", { value: {}, configurable: true });
  try {
    assert.throws(() => createPreviewGrant(input, options), /服务端/);
    assert.throws(() => verifyPreviewGrant(token, { host, projectId: id }, options), /服务端/);
  } finally {
    if (previous) Object.defineProperty(globalThis, "window", previous);
    else Reflect.deleteProperty(globalThis, "window");
  }
});
