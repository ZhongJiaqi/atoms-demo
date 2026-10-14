import assert from "node:assert/strict";
import test,{mock} from "node:test";
const id="123e4567-e89b-42d3-a456-426614174002",owner="123e4567-e89b-42d3-a456-426614174001",run="123e4567-e89b-42d3-a456-426614174003";
mock.module("../../lib/supabase/server.ts",{namedExports:{createClient:async()=>({auth:{getUser:async()=>({data:{user:{id:owner}},error:null})}})}});
mock.module("../../lib/agent/run-generation.ts",{namedExports:{runGeneration:async(_requirement:string,_origin:string,emit:(event:unknown)=>void)=>{emit({event:"complete",data:{projectId:id,version:1,previewUrl:"http://local.example/preview"}});}}});
mock.module("../../lib/agent/run-cloud-generation.ts",{namedExports:{runCloudGeneration:async(_requirement:string,_origin:string,emit:(event:unknown)=>void)=>{emit({event:"accepted",data:{projectId:id}});emit({event:"complete",data:{projectId:id,version:1,artifactPath:`${owner}/${id}/${run}.json`,previewReady:false}});}}});
const {POST}=await import("../../app/api/generate/route.ts");

test("cloud生成已保存后预览配置失败仍返回完成版本，且不受本机全局锁阻断",async()=>{
  const old=process.env.VERCEL,oldDeployment=process.env.VERCEL_DEPLOYMENT_ID;process.env.VERCEL="1";delete process.env.VERCEL_DEPLOYMENT_ID;
  globalThis.__atomsGenerationActive=true;
  try{
    const response=await POST(new Request("https://app.example/api/generate",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({requirement:"生成测试"})}));
    assert.equal(response.status,200);
    const body=await response.text();
    assert.match(body,/event: accepted/);assert.match(body,/event: complete/);assert.match(body,/"version":1/);assert.match(body,/"artifactPath"/);assert.match(body,/"previewReady":false/);assert.match(body,/"previewError"/);
    assert.doesNotMatch(body,/event: error/);
    assert.equal(globalThis.__atomsGenerationActive,true,"云请求不能释放另一local任务的锁");
  }finally{globalThis.__atomsGenerationActive=false;if(old===undefined)delete process.env.VERCEL;else process.env.VERCEL=old;if(oldDeployment===undefined)delete process.env.VERCEL_DEPLOYMENT_ID;else process.env.VERCEL_DEPLOYMENT_ID=oldDeployment;}
});
