import assert from "node:assert/strict";
import test from "node:test";
import { artifactObjectPath } from "../../lib/cloud/artifacts.ts";
import { createPreviewGrant } from "../../lib/cloud/preview-grant.ts";
import { previewHost } from "../../lib/cloud/preview-domain.ts";
import { ATOMS_VERCEL_PROJECT_ID } from "../../lib/cloud/preview-domain.ts";
import { verifyPreviewGrant } from "../../lib/cloud/preview-grant.ts";

test("云预览选取对应不可变版本的completed run产物，旧版本以同runUUID恢复",async()=>{
  const module=await import("../../lib/cloud/preview-access.ts");
  assert.equal(typeof module.versionArtifactPath,"function","缺少版本绑定产物查询");
  const owner="123e4567-e89b-42d3-a456-426614174001",project="123e4567-e89b-42d3-a456-426614174002",run="123e4567-e89b-42d3-a456-426614174003";
  const bundle:Parameters<typeof module.versionArtifactPath>[0]={project:{id:project},runs:[{id:run,status:"completed",version:1,events:[]}]};
  assert.equal(module.versionArtifactPath(bundle,owner,1),`${owner}/${project}/${run}.json`);
  assert.throws(()=>module.versionArtifactPath(bundle,owner,2),/成功任务/);
  bundle.runs[0].events=[{event:"complete",data:{artifactPath:artifactObjectPath(owner,project,"123e4567-e89b-42d3-a456-426614174004")}}];
  assert.throws(()=>module.versionArtifactPath(bundle,owner,1),/产物.*任务/);
});

test("gateway实际读取字节超限即停止，即使响应未声明Content-Length",async t=>{
  const {serveCloudPreview}=await import("../../lib/cloud/preview-access.ts");
  const owner="123e4567-e89b-42d3-a456-426614174001",project="123e4567-e89b-42d3-a456-426614174002",run="123e4567-e89b-42d3-a456-426614174003";
  const before=process.env.ATOMS_PREVIEW_GRANT_SECRET;
  process.env.ATOMS_PREVIEW_GRANT_SECRET="test-only-preview-secret-32bytes-minimum";
  const path=artifactObjectPath(owner,project,run);
  const grant=createPreviewGrant({projectId:project,version:1,artifactPath:path,signedArtifactUrl:`https://jvnweimexkigooqvagfz.supabase.co/storage/v1/object/sign/atoms-artifacts/${path}?token=one-object`});
  const json=JSON.stringify({files:[{path:"index.html",content:Buffer.from("<!doctype html><main>Small</main>").toString("base64"),contentType:"text/html"}]});
  const payload=Buffer.from(json+" ".repeat(7*1024*1024));
  let offset=0,cancelled=false;
  t.mock.method(globalThis,"fetch",async()=>new Response(new ReadableStream({
    pull(controller){if(offset===payload.length){controller.close();return;}const next=Math.min(payload.length,offset+1024*1024);controller.enqueue(payload.subarray(offset,next));offset=next;},
    cancel(){cancelled=true;},
  },{highWaterMark:0})));
  try{
    assert.equal((await serveCloudPreview(new Request(`https://${previewHost(project)}/api/preview/${project}/?grant=${grant}`),project)).status,502);
    assert.ok(offset<payload.length,"不能把无限/超限响应全部读入内存");assert.equal(cancelled,true);
  }finally{if(before===undefined)delete process.env.ATOMS_PREVIEW_GRANT_SECRET;else process.env.ATOMS_PREVIEW_GRANT_SECRET=before;}
});

test("已保存版本签发短期grant前验证项目限定权限并自动绑定新预览地址",async t=>{
  const module=await import("../../lib/cloud/preview-access.ts");
  assert.equal(typeof module.createCloudPreviewLink,"function","缺少签名链接签发");
  const owner="123e4567-e89b-42d3-a456-426614174001",project="123e4567-e89b-42d3-a456-426614174002",run="123e4567-e89b-42d3-a456-426614174003";
  const names=["ATOMS_PREVIEW_GRANT_SECRET","VERCEL_DEPLOYMENT_ID","ATOMS_VERCEL_API_TOKEN","ATOMS_SCOPE_DENY_PROJECT_ID"];
  const before=names.map(name=>process.env[name]);
  process.env.ATOMS_PREVIEW_GRANT_SECRET="test-only-preview-secret-32bytes-minimum";
  process.env.VERCEL_DEPLOYMENT_ID="dpl_TestOnly123";
  process.env.ATOMS_VERCEL_API_TOKEN="test-only-management-boundary";
  process.env.ATOMS_SCOPE_DENY_PROJECT_ID="prj_knownForeign";
  const path=artifactObjectPath(owner,project,run);
  let permissionProbes=0,aliasReads=0,posts=0;
  t.mock.method(globalThis,"fetch",async(input:RequestInfo|URL,init?:RequestInit)=>{
    const pathname=new URL(String(input)).pathname;
    if(pathname===`/v9/projects/${ATOMS_VERCEL_PROJECT_ID}`){permissionProbes++;return Response.json({id:ATOMS_VERCEL_PROJECT_ID});}
    if(pathname==="/v9/projects/prj_knownForeign"){permissionProbes++;return Response.json({}, {status:403});}
    if(init?.method==="POST"){assert.equal(permissionProbes,2);posts++;return Response.json({uid:"alias_test",alias:previewHost(project)});}
    if(pathname.startsWith("/v13/deployments/"))return Response.json({id:"dpl_TestOnly123",projectId:ATOMS_VERCEL_PROJECT_ID,readyState:"READY"});
    aliasReads++;
    return aliasReads===1 ? Response.json({}, {status:404}) : Response.json({alias:previewHost(project),projectId:ATOMS_VERCEL_PROJECT_ID,deploymentId:"dpl_TestOnly123"});
  });
  const client={auth:{getUser:async()=>({data:{user:{id:owner}},error:null})},storage:{from:()=>({createSignedUrl:async(_path:string,ttl:number)=>{
    assert.equal(_path,path);assert.equal(ttl,300);
    return {data:{signedUrl:`https://jvnweimexkigooqvagfz.supabase.co/storage/v1/object/sign/atoms-artifacts/${path}?token=object-only`},error:null};
  }})}};
  try{
    const result=await module.createCloudPreviewLink(client as never,project,2,path);
    const url=new URL(result.previewUrl);
    assert.equal(url.hostname,previewHost(project));
    assert.equal(url.pathname,`/api/preview/${project}/`);
    const grant=verifyPreviewGrant(url.searchParams.get("grant")!,{host:url.hostname,projectId:project});
    assert.equal(grant.version,2);assert.equal(grant.artifactPath,path);
    assert.equal(result.expiresAt,grant.expiresAt*1000);
    assert.equal(permissionProbes,2);assert.equal(posts,1);assert.equal(aliasReads,2);
  }finally{names.forEach((name,index)=>{if(before[index]===undefined)delete process.env[name];else process.env[name]=before[index];});}
});

test("gateway只有匹配项目host的有效grant能读取单个签名产物，Cookie不转发",async t=>{
  const module=await import("../../lib/cloud/preview-access.ts");
  assert.equal(typeof module.serveCloudPreview,"function","缺少签名预览gateway");
  const owner="123e4567-e89b-42d3-a456-426614174001",project="123e4567-e89b-42d3-a456-426614174002",run="123e4567-e89b-42d3-a456-426614174003";
  const secret="test-only-preview-secret-32bytes-minimum";
  const before=process.env.ATOMS_PREVIEW_GRANT_SECRET;
  const beforeDeploymentUrl=process.env.VERCEL_URL;
  process.env.ATOMS_PREVIEW_GRANT_SECRET=secret;
  process.env.VERCEL_URL="atoms-test-jiaqis-projects-c666d1ab.vercel.app";
  const path=artifactObjectPath(owner,project,run);
  const url=`https://jvnweimexkigooqvagfz.supabase.co/storage/v1/object/sign/atoms-artifacts/${path}?token=test-object-only`;
  const grant=createPreviewGrant({projectId:project,version:1,artifactPath:path,signedArtifactUrl:url},{secret});
  let requests=0;
  t.mock.method(globalThis,"fetch",async(input:RequestInfo|URL,init?:RequestInit)=>{
    requests++;
    assert.equal(input,url);
    assert.equal(init?.redirect,"error");
    assert.equal(new Headers(init?.headers).has("cookie"),false);
    assert.equal(new Headers(init?.headers).has("authorization"),false);
    return Response.json({files:[{path:"index.html",content:Buffer.from("<!doctype html><main>Cloud</main>").toString("base64"),contentType:"text/html"}]});
  });
  try{
    const response=await module.serveCloudPreview(new Request(`https://${previewHost(project)}/api/preview/${project}/?grant=${grant}`,{headers:{Cookie:"host-secret=never-forward"}}),project,[]);
    assert.equal(response.status,200);
    assert.match(await response.text(),/Cloud/);
    assert.match(response.headers.get("content-security-policy")!,/connect-src 'none'/);
    assert.match(response.headers.get("content-security-policy")!,/https:\/\/atoms-test-jiaqis-projects-c666d1ab.vercel.app/);
    assert.equal(response.headers.get("cache-control"),"private, no-store");
    assert.equal((await module.serveCloudPreview(new Request(`https://atoms-demo-jiaqi.vercel.app/api/preview/${project}/?grant=${grant}`),project,[])).status,403);
    assert.equal((await module.serveCloudPreview(new Request(`https://${previewHost(project)}/api/preview/${project}/?grant=${grant}`),project,["assets","app.js"])).status,403);
    assert.equal(requests,1);
  }finally{if(before===undefined)delete process.env.ATOMS_PREVIEW_GRANT_SECRET;else process.env.ATOMS_PREVIEW_GRANT_SECRET=before;if(beforeDeploymentUrl===undefined)delete process.env.VERCEL_URL;else process.env.VERCEL_URL=beforeDeploymentUrl;}
});
