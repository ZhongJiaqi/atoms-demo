import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { uploadArtifact, readArtifact, createSignedArtifactUrl, deleteArtifact, ARTIFACT_BUCKET } from "../../lib/cloud/artifacts.ts";
import { acquireProjectLease, renewProjectLease, releaseProjectLease, saveCloudProjectSnapshot } from "../../lib/cloud/project-lease.ts";

test("真实Atoms数据库：私有产物、签名读取、跨账号拒绝和原子租约", { skip: process.env.ATOMS_REAL_DB !== "1", timeout: 90000 }, async () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
  const ref = new URL(url).hostname.split(".")[0];
  assert.equal(ref, "jvnweimexkigooqvagfz", "只允许本项目测试数据库");
  const keys = JSON.parse(execFileSync("supabase", ["projects", "api-keys", "--project-ref", ref, "-o", "json"], { encoding: "utf8" })) as { name: string; api_key: string }[];
  const serviceKey = keys.find((item) => item.name === "service_role")?.api_key;
  assert.ok(serviceKey, "测试账号管理凭据缺失，不输出凭据");
  const cloudSaveStatuses: number[] = [];
  const request = async (input: RequestInfo | URL, init?: RequestInit) => {
    const endpoint = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url).pathname;
    const timeout = AbortSignal.timeout(15000);
    const response = await fetch(input, { ...init, signal: init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout });
    if (endpoint === "/rest/v1/rpc/save_cloud_project_version") cloudSaveStatuses.push(response.status);
    return response;
  };
  const options = { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: request } };
  const admin = createClient(url, serviceKey, options);
  const projectId = randomUUID(); const users: string[] = [];
  let path: string | undefined; let primary: Parameters<typeof deleteArtifact>[0] | undefined;
  let testFailed = false;
  try {
    const clients = [];
    for (const number of [1, 2]) {
      const email = `atoms-cloud-${randomUUID()}-${number}@example.invalid`, password = randomUUID();
      const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
      assert.equal(created.error, null); assert.ok(created.data.user); users.push(created.data.user.id);
      const client = createClient(url, key, options);
      assert.equal((await client.auth.signInWithPassword({ email, password })).error, null);
      clients.push(client);
    }
    const [a, b] = clients; primary = a;
    assert.equal((await a.from("projects").insert({ id: projectId, owner_id: users[0], name: "云存储验收" })).error, null);
    const runId = randomUUID();
    const snapshot = {
      projectId, expectedVersion: 0, projectName: "租约保存验收", summary: "原子云快照",
      messages: [{ id: randomUUID(), role: "user" as const, content: "保存我的应用", created_at: "2026-10-14T00:00:00.000Z", turn_id: runId, sequence: 0 }],
      files: [{ path: "src/App.tsx", content: "export default function App() { return <h1>Lease</h1>; }" }],
      run: { id: runId, mode: "create", requirement: "租约验收", status: "completed", events: [], startedAt: new Date().toISOString(), completedAt: new Date().toISOString() },
    };
    // 删除数据库租约校验会使这些断言失败：拒绝保存时五张业务表都不得变化。
    const persistedState = async () => {
      const results = await Promise.all([
        a.from("projects").select("name,summary,current_version,updated_at").eq("id", projectId).single(),
        ...["project_versions", "project_files", "messages", "agent_runs"].map(table => a.from(table).select("*").eq("project_id", projectId)),
      ]);
      for (const result of results) assert.equal(result.error, null);
      return results.map(result => result.data);
    };
    const missingLeaseState = await persistedState();
    await assert.rejects(saveCloudProjectSnapshot(a, { projectId, token: randomUUID(), ttlSeconds: 900 }, snapshot), /租约已失效/);
    assert.deepEqual(await persistedState(), missingLeaseState);
    const bundle = { files: [{ path: "index.html", content: Buffer.from("<h1>Cloud artifact</h1>").toString("base64"), contentType: "text/html" }] };
    path = await uploadArtifact(a, projectId, randomUUID(), bundle);
    assert.deepEqual(await readArtifact(a, projectId, path), bundle);
    assert.ok((await b.storage.from(ARTIFACT_BUCKET).download(path)).error, "其他账号不能直接读取");
    assert.ok((await b.storage.from(ARTIFACT_BUCKET).createSignedUrl(path, 60)).error, "其他账号不能签名");
    const forged = `${users[1]}/${projectId}/${randomUUID()}.json`;
    assert.ok((await b.storage.from(ARTIFACT_BUCKET).upload(forged, new Blob([JSON.stringify(bundle)], { type: "application/json" }))).error, "身份相符但项目不属于自己仍拒绝上传");
    const anonymous = await request(`${url}/storage/v1/object/public/${ARTIFACT_BUCKET}/${path}`);
    assert.notEqual(anonymous.status, 200, "bucket不是公开资源");
    const signed = await request(await createSignedArtifactUrl(a, projectId, path, 60));
    assert.equal(signed.status, 200); assert.deepEqual(await signed.json(), bundle);
    const acquired = await Promise.allSettled([acquireProjectLease(a, projectId), acquireProjectLease(a, projectId)]);
    assert.equal(acquired.filter((item) => item.status === "fulfilled").length, 1);
    const winning = acquired.find((item) => item.status === "fulfilled");
    assert.ok(winning?.status === "fulfilled");
    await assert.rejects(acquireProjectLease(b, projectId));
    assert.ok((await a.from("project_leases").update({ token: randomUUID() }).eq("project_id", projectId)).error, "用户不能直接篡改租约");
    await renewProjectLease(a, winning.value);
    assert.equal((await admin.from("project_leases").update({ expires_at: "2000-01-01T00:00:00Z" }).eq("project_id", projectId)).error, null);
    const expiredState = await persistedState();
    await assert.rejects(saveCloudProjectSnapshot(a, winning.value, snapshot), /租约已失效/);
    assert.deepEqual(await persistedState(), expiredState, "过期任务不能写入任何快照数据");
    const replacement = await acquireProjectLease(a, projectId);
    await assert.rejects(saveCloudProjectSnapshot(a, winning.value, snapshot), /租约已失效/);
    assert.deepEqual(await persistedState(), expiredState, "旧令牌不能覆盖新任务");
    await assert.rejects(saveCloudProjectSnapshot(b, replacement, snapshot), /项目不存在或无权限/);
    assert.deepEqual(await persistedState(), expiredState);
    assert.equal(await saveCloudProjectSnapshot(a, replacement, snapshot), 1);
    const savedState = await persistedState();
    assert.equal((savedState[0] as { current_version: number }).current_version, 1);
    assert.equal((savedState[1] as unknown[]).length, 1);
    assert.deepEqual((savedState[2] as { path: string; content: string }[]).map(({ path, content }) => ({ path, content })), snapshot.files);
    assert.deepEqual((savedState[3] as { role: string; content: string; sequence: number }[]).map(({ role, content, sequence }) => ({ role, content, sequence })), [{ role: "user", content: "保存我的应用", sequence: 0 }]);
    assert.equal((savedState[4] as { id: string }[])[0].id, snapshot.run.id);
    await assert.rejects(saveCloudProjectSnapshot(a, replacement, { ...snapshot, run: { ...snapshot.run, id: randomUUID() } }), /version conflict/);
    assert.deepEqual(await persistedState(), savedState, "旧基线版本冲突必须即时拒绝且不能部分提交");
    await assert.rejects(renewProjectLease(a, winning.value));
    await assert.rejects(releaseProjectLease(a, winning.value));
    await releaseProjectLease(a, replacement);
    await assert.rejects(saveCloudProjectSnapshot(a, replacement, { ...snapshot, expectedVersion: 1, run: { ...snapshot.run, id: randomUUID() } }), /租约已失效/);
    assert.deepEqual(await persistedState(), savedState, "已释放任务不能继续提交");
    assert.deepEqual(cloudSaveStatuses, [409, 409, 409, 403, 200, 409, 409], "租约/版本冲突返回409，无权限仍403，成功200");
    await deleteArtifact(a, projectId, path); path = undefined;
  } catch (error) {
    testFailed = true;
    throw error;
  } finally {
    const artifactCleanup = await Promise.allSettled(path && primary ? [deleteArtifact(primary, projectId, path)] : []);
    // 只删除本用例新建UUID项目/临时账号，不操作已有真实用户。
    const accountCleanup = await Promise.allSettled([
      (async () => { assert.equal((await admin.from("projects").delete().eq("id", projectId)).error, null); })(),
      ...users.map(async id => { assert.equal((await admin.auth.admin.deleteUser(id)).error, null); }),
    ]);
    const failures = [...artifactCleanup, ...accountCleanup].filter(result => result.status === "rejected").length;
    if (failures && testFailed) console.error(`真实DB测试清理失败：${failures}项（保留原始失败）`);
    else assert.equal(failures, 0, "真实DB测试资源必须全部清理");
  }
});
