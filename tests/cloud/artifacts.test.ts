import assert from "node:assert/strict";
import test from "node:test";

import * as mod from "../../lib/cloud/artifacts.ts";
const owner = "11111111-1111-4111-8111-111111111111";
const project = "22222222-2222-4222-8222-222222222222";
const artifact = "33333333-3333-4333-8333-333333333333";
const bundle = { files: [{ path: "index.html", content: "aGk=", contentType: "text/html" }] };

test("产物验证保留合法资源并拒绝路径逃逸、重复、无效编码和超限", () => {
  assert.equal(typeof mod.validateArtifactBundle, "function", "缺少产物验证");
  assert.deepEqual(mod.validateArtifactBundle(bundle), bundle);
  for (const path of ["../evil", "/evil", "a/../evil", "a\\evil", "a//evil", "a/%2e%2e/evil", "a?x", "a#x"]) {
    assert.throws(() => mod.validateArtifactBundle({ files: [{ ...bundle.files[0], path }] }));
  }
  assert.throws(() => mod.validateArtifactBundle({ files: [bundle.files[0], bundle.files[0]] }));
  assert.throws(() => mod.validateArtifactBundle({ files: [{ ...bundle.files[0], content: "%%%" }] }));
  assert.throws(() => mod.validateArtifactBundle({ files: [{ ...bundle.files[0], content: Buffer.alloc(4 * 1024 * 1024).toString("base64") }] }));
  assert.throws(() => mod.validateArtifactBundle({ files: [], thumbnail: "aGk=" }));
  assert.throws(() => mod.validateArtifactBundle({ files: Array.from({length:257}, (_, n) => ({...bundle.files[0],path:`f${n}.html`})) }));
});

test("上传路径从验证用户派生且不可覆盖旧产物", async () => {
  assert.equal(typeof mod.uploadArtifact, "function", "缺少私有上传");
  let uploaded: unknown[] = [];
  const client = { auth: { getUser: async () => ({data:{user:{id:owner}},error:null}) }, storage:{from(bucket:string){
    assert.equal(bucket,"atoms-artifacts");
    return {upload:async (...args:unknown[]) => {uploaded=args;return {data:{path:args[0]},error:null};}};
  }} };
  const path = await mod.uploadArtifact(client as never, project, artifact, bundle);
  assert.equal(path, `${owner}/${project}/${artifact}.json`);
  assert.equal(uploaded[0], `${owner}/${project}/${artifact}.json`);
  assert.deepEqual(JSON.parse(await (uploaded[1] as Blob).text()), bundle);
  assert.deepEqual(uploaded[2], {contentType:"application/json",upsert:false});
  await assert.rejects(mod.uploadArtifact({...client,auth:{getUser:async()=>({data:{user:null},error:null})}} as never,project,artifact,bundle), /登录/);
});

test("读取、签名和清理只接受当前用户同项目精确路径", async () => {
  assert.equal(typeof mod.readArtifact,"function", "缺少产物读取");
  const path = `${owner}/${project}/${artifact}.json`;
  const client = {auth:{getUser:async()=>({data:{user:{id:owner}},error:null})},storage:{from(){return {
    download:async()=>({data:new Blob([JSON.stringify(bundle)]),error:null}),
    createSignedUrl:async (p:string,seconds:number)=>{assert.equal(p,path);assert.equal(seconds,60);return {data:{signedUrl:"https://storage.example/artifact?token=limited"},error:null};},
    remove:async(paths:string[])=>{assert.deepEqual(paths,[path]);return {data:[],error:null};},
  };}}};
  assert.deepEqual(await mod.readArtifact(client as never,project,path),bundle);
  assert.equal(await mod.createSignedArtifactUrl(client as never,project,path,60),"https://storage.example/artifact?token=limited");
  await mod.deleteArtifact(client as never,project,path);
  await assert.rejects(mod.deleteArtifact(client as never,project,path.replace(owner,artifact)), /路径/);
  await assert.rejects(mod.createSignedArtifactUrl(client as never,project,path,3601), /有效期/);
});
