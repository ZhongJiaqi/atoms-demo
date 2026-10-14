import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { createClient } from "@supabase/supabase-js";
import { runCloudGeneration } from "../../lib/agent/run-cloud-generation.ts";
import type { AgentEvent } from "../../lib/agent/types.ts";
import { ARTIFACT_BUCKET, createSignedArtifactUrl, readArtifact } from "../../lib/cloud/artifacts.ts";
import { loadPersistedProject, loadProjectVersion, type ProjectQueryClient } from "../../lib/persistence/project-store.ts";
import { cleanupCloudFixture } from "./test-utils/cloud-cleanup.ts";

// Real Node integration only: no gateway, iframe, browser interaction or mocked transport.
test("真实云Agent创建与同项目修改保存v1/v2、完整聊天任务及私有可读取产物", {
  skip: process.env.ATOMS_REAL_AGENT !== "1", timeout: 500000,
}, async () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
  const ref = new URL(url).hostname.split(".")[0];
  assert.equal(ref, "jvnweimexkigooqvagfz", "只允许Atoms专用测试数据库");
  assert.ok(process.env.LLM_API_KEY, "需已有模型配置，不输出凭据");

  if (!process.env.VERCEL_OIDC_TOKEN) {
    const result = spawnSync("vercel", ["project", "token", "atoms-demo", "--scope", "jiaqis-projects-c666d1ab", "--yes"], { encoding: "utf8", timeout: 30000 });
    assert.equal(result.status, 0, "Atoms专用SDK OIDC获取失败，不输出CLI原始内容");
    const token = `${result.stdout}\n${result.stderr}`.match(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/)?.[0];
    assert.ok(token, "CLI未返回SDK OIDC，不输出CLI原始内容");
    process.env.VERCEL_OIDC_TOKEN = token;
  }
  const keys = JSON.parse(execFileSync("supabase", ["projects", "api-keys", "--project-ref", ref, "-o", "json"], { encoding: "utf8" })) as {name: string; api_key: string}[];
  const serviceKey = keys.find(item => item.name === "service_role")?.api_key;
  assert.ok(serviceKey, "测试账户管理配置缺失，不输出凭据");
  const options = {auth:{persistSession:false, autoRefreshToken:false},global:{fetch:(input: RequestInfo | URL, init?: RequestInit) => {
    const timeout = AbortSignal.timeout(15000);
    return fetch(input,{...init,signal:init?.signal ? AbortSignal.any([init.signal,timeout]):timeout});
  }}};
  const admin = createClient(url, serviceKey, options);
  const client = createClient(url, key, options);
  let userId: string | undefined;
  let failed = false;
  const events: AgentEvent[] = [];
  try {
    const email = `atoms-agent-${randomUUID()}@example.invalid`, password = randomUUID();
    const created = await admin.auth.admin.createUser({email,password,email_confirm:true});
    assert.equal(created.error, null);
    assert.ok(created.data.user);
    userId = created.data.user.id;
    assert.equal((await client.auth.signInWithPassword({email,password})).error, null);
    const emit = (event: AgentEvent) => {
      events.push(event);
      console.info(`真实云Agent阶段 ${event.event}`);
    };
    const requirement = "创建一个中文极简计数器。显示计数值和一个文本为增加的按钮，每次点击加一。初始为0，用localStorage保存计数，刷新能恢复。不要其他功能。";
    await runCloudGeneration(requirement,"https://atoms-demo-jiaqi.vercel.app",emit,client);
    const first = events.find(event => event.event === "complete");
    assert.ok(first, "真实创建必须在保存完成后发出complete");
    const projectId = first.data.projectId;
    assert.equal(typeof projectId,"string");
    assert.equal(first.data.version,1);
    assert.equal(first.data.previewReady,false);
    assert.equal(first.data.previewUrl,undefined,"没有gateway时不能声称预览可用");
    const store = client as unknown as ProjectQueryClient;
    const v1 = await loadProjectVersion(store,projectId as string,1);
    assert.match(v1.files.find(file => file.path === "src/App.tsx")!.content,/localStorage/);
    const modification = "继续修改同一计数器，把增加按钮文本改为加一，再增加一个文本为重置的按钮，点击后计数归零并更新localStorage。保持原计数持久化功能。";
    await runCloudGeneration(modification,"https://atoms-demo-jiaqi.vercel.app",emit,client,projectId as string);
    const complete = events.filter(event => event.event === "complete");
    assert.equal(complete.length,2);
    assert.equal(complete[1].data.projectId,projectId);
    assert.equal(complete[1].data.version,2);
    const bundle = await loadPersistedProject(store,projectId as string);
    assert.equal(bundle.project.current_version,2);
    assert.deepEqual(bundle.messages.map(message => message.role),["user","assistant","user","assistant"]);
    assert.deepEqual(bundle.messages.filter(message => message.role === "user").map(message => message.content),[requirement,modification]);
    assert.deepEqual(bundle.runs.map(run => ({mode:run.mode,status:run.status,version:run.version})),[
      {mode:"create",status:"completed",version:1},{mode:"modify",status:"completed",version:2},
    ]);
    for (const run of bundle.runs) {
      assert.equal(run.events.at(-1)?.event,"complete");
      assert.ok(run.events.some(event => event.event === "model_started"));
      assert.ok(run.events.some(event => event.event === "build_started"));
    }
    assert.deepEqual(await loadProjectVersion(store,projectId as string,1),v1,"修改必须保留不可变v1源码");
    const v2 = await loadProjectVersion(store,projectId as string,2);
    assert.notDeepEqual(v2.files,v1.files);
    const source = v2.files.map(file => file.content).join("\n");
    assert.match(source,/localStorage/);
    assert.match(source,/加一/);
    assert.match(source,/重置/);
    assert.deepEqual([...bundle.files].sort((a,b)=>a.path.localeCompare(b.path)),[...v2.files].sort((a,b)=>a.path.localeCompare(b.path)));
    for (const event of complete) {
      const path = event.data.artifactPath;
      assert.equal(typeof path,"string");
      const artifact = await readArtifact(client,projectId as string,path as string);
      const index = artifact.files.find(file=>file.path === "index.html");
      assert.ok(index);
      assert.match(Buffer.from(index.content,"base64").toString("utf8"),/assets\//);
      assert.ok(artifact.files.some(file=>file.path.endsWith(".js")));
      const signed = await options.global.fetch(await createSignedArtifactUrl(client,projectId as string,path as string,60));
      assert.equal(signed.status,200);
      assert.deepEqual(await signed.json(),artifact);
      assert.equal(bundle.runs.find(run=>run.version === event.data.version)?.events.at(-1)?.data.artifactPath,path);
    }
  } catch(error) {
    failed = true;
    throw error;
  } finally {
    // This account was created here; list its own drafts too, including a pre-accepted failure.
    const cleanup = userId ? await cleanupCloudFixture({
      listProjects: async () => {
        const projects = await admin.from("projects").select("id").eq("owner_id",userId!);
        if (projects.error) throw projects.error;
        return (projects.data ?? []).map(project => project.id as string);
      },
      removeArtifacts: async id => {
        const prefix = `${userId}/${id}`;
        const listed = await client.storage.from(ARTIFACT_BUCKET).list(prefix,{limit:1000});
        if (listed.error) throw listed.error;
        if (listed.data.length) {
          const removed = await client.storage.from(ARTIFACT_BUCKET).remove(listed.data.map(file=>`${prefix}/${file.name}`));
          if (removed.error) throw removed.error;
        }
      },
      removeProject: async id => {
        const removed = await admin.from("projects").delete().eq("id",id).eq("owner_id",userId!);
        if (removed.error) throw removed.error;
      },
      removeAccount: async () => {
        const removed = await admin.auth.admin.deleteUser(userId!);
        if (removed.error) throw removed.error;
      },
    },events.filter(event => event.event === "accepted").map(event => event.data.projectId).filter((id): id is string => typeof id === "string")) : [];
    if (cleanup.length && failed) console.error(`真实云Agent清理失败 ${cleanup.length} 项，保留原始错误`);
    else assert.equal(cleanup.length,0,"临时用户、项目与产物必须全部清理");
  }
});
