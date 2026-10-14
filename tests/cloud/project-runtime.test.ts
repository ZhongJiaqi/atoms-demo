import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test,{mock} from "node:test";

const id="123e4567-e89b-42d3-a456-426614174002",owner="123e4567-e89b-42d3-a456-426614174001",run="123e4567-e89b-42d3-a456-426614174003";
mock.module("../../lib/sandbox/vercel-build.ts",{namedExports:{buildInVercelSandbox:async(directory:string)=>{
  await mkdir(join(directory,"dist"));await writeFile(join(directory,"dist/index.html"),"<main>Immutable</main>");
  return {success:true,exitCode:0,signal:null,stdout:"",stderr:"",timedOut:false,resourceExceeded:false,durationMs:1};
}}});

test("旧local版本cloud恢复只从不可变v快照重建产物，不调用版本保存RPC",async()=>{
  const module=await import("../../lib/cloud/project-runtime.ts");
  assert.equal(typeof module.resumeCloudProject,"function","缺少云恢复入口");
  const files=[{path:"src/App.tsx",content:"export default function App(){return <main>Immutable</main>}"},{path:"src/styles.css",content:"body{margin:0}"}];
  const data:Record<string,unknown>={projects:{id,name:"旧项目",summary:"旧版本",current_version:1,created_at:"2026-10-14T00:00:00Z",updated_at:"2026-10-14T00:00:00Z"},messages:[],project_files:files,project_versions:{version:1,name:"旧项目",summary:"旧版本",files},agent_runs:[{id:run,mode:"create",requirement:"旧需求",status:"completed",events:[],version:1,started_at:"2026-10-14T00:00:00Z",completed_at:"2026-10-14T00:00:00Z"}]};
  const calls:string[]=[];
  let artifact:Blob|undefined;
  const client={auth:{getUser:async()=>({data:{user:{id:owner}},error:null})},
    from:(table:string)=>{const query={select:()=>query,eq:()=>query,single:async()=>({data:data[table],error:null}),order:async()=>({data:data[table],error:null})};return query;},
    rpc:async(name:string)=>{calls.push(name);return {data:true,error:null};},
    storage:{from:()=>({download:async()=>artifact?{data:artifact,error:null}:{data:null,error:{message:"Object not found"}},upload:async(path:string,value:Blob)=>{calls.push(path);artifact=value;return{error:null};}})},
  };
  const before=process.env.VERCEL_DEPLOYMENT_ID;delete process.env.VERCEL_DEPLOYMENT_ID;
  try{
    const first=await module.resumeCloudProject(client as never,id);
    assert.equal(first.state.currentVersion,1);
    assert.equal(first.previewReady,false);
    assert.match("previewError" in first ? first.previewError : "",/VERCEL_DEPLOYMENT_ID/);
    assert.deepEqual(calls,["acquire_project_lease",`${owner}/${id}/${run}.json`,"release_project_lease"]);
    await module.resumeCloudProject(client as never,id);
    assert.equal(calls.filter(value=>value.endsWith(".json")).length,1,"已存在产物不得再次覆盖上传");
    assert.equal(calls.some(value=>value.includes("save_")),false);
  }finally{if(before===undefined)delete process.env.VERCEL_DEPLOYMENT_ID;else process.env.VERCEL_DEPLOYMENT_ID=before;}
});

test("云回滚在同lease下构建旧快照并fenced保存新版本，保留原聊天与任务",async()=>{
  const module=await import("../../lib/cloud/project-runtime.ts");
  assert.equal(typeof module.restoreCloudProject,"function","缺少云历史回滚");
  const files=[{path:"src/App.tsx",content:"export default function App(){return <main>Old</main>}"},{path:"src/styles.css",content:"body{margin:0}"}];
  const data:Record<string,unknown>={projects:{id,name:"原项目",summary:"当前v2",current_version:2,created_at:"2026-10-14T00:00:00Z",updated_at:"2026-10-14T00:00:00Z"},messages:[{id:run,role:"user",content:"原需求",turn_id:run,created_at:"2026-10-14T00:00:00Z"},{id:owner,role:"assistant",content:"原回答",turn_id:run,created_at:"2026-10-14T00:00:00Z"}],project_files:files,project_versions:{version:1,name:"原项目",summary:"旧版本",files},agent_runs:[{id:run,mode:"modify",requirement:"原需求",status:"completed",events:[],version:2,started_at:"2026-10-14T00:00:00Z",completed_at:"2026-10-14T00:00:00Z"}]};
  const calls:string[]=[];let artifactPath="";
  const client={auth:{getUser:async()=>({data:{user:{id:owner}},error:null})},
    from:(table:string)=>{const query={select:()=>query,eq:()=>query,single:async()=>({data:data[table],error:null}),order:async()=>({data:data[table],error:null})};return query;},
    rpc:async(name:string,args:Record<string,unknown>)=>{calls.push(name);if(name==="save_cloud_project_version"){
      assert.equal(args.p_expected_version,2);assert.equal(typeof args.p_lease_token,"string");
      assert.equal((args.p_messages as unknown[]).length,4);
      const savedRun=args.p_run as {events:{data:Record<string,unknown>}[]};assert.equal(savedRun.events.at(-1)?.data.artifactPath,artifactPath);
      return {data:3,error:null};
    }return {data:true,error:null};},
    storage:{from:()=>({upload:async(path:string)=>{artifactPath=path;calls.push("upload");return {error:null};}})},
  };
  const before=process.env.VERCEL_DEPLOYMENT_ID;delete process.env.VERCEL_DEPLOYMENT_ID;
  try{
    const result=await module.restoreCloudProject(client as never,id,1,2);
    assert.equal(result.state.currentVersion,3);assert.equal(result.state.turns.length,2);
    assert.deepEqual(result.state.messages.slice(0,2).map(message=>message.content),["原需求","原回答"]);
    assert.deepEqual(calls,["acquire_project_lease","upload","save_cloud_project_version","release_project_lease"]);
    assert.equal(result.previewReady,false);
  }finally{if(before===undefined)delete process.env.VERCEL_DEPLOYMENT_ID;else process.env.VERCEL_DEPLOYMENT_ID=before;}
});
