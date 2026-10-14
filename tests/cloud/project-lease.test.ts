import assert from "node:assert/strict";
import test from "node:test";
import * as mod from "../../lib/cloud/project-lease.ts";
const project = "22222222-2222-4222-8222-222222222222";
const token = "33333333-3333-4333-8333-333333333333";
test("租约RPC绑定项目和唯一令牌并如实报告冲突", async () => {
  assert.equal(typeof mod.acquireProjectLease,"function", "缺少租约获取");
  const calls: unknown[] = [];
  const client = {rpc:async(name:string,payload:Record<string,unknown>)=>{calls.push([name,payload]);return {data:true,error:null};}};
  const lease = await mod.acquireProjectLease(client,project,900,token);
  assert.deepEqual(lease,{projectId:project,token,ttlSeconds:900});
  await mod.renewProjectLease(client,lease);
  await mod.releaseProjectLease(client,lease);
  assert.deepEqual(calls,[
    ["acquire_project_lease",{p_project_id:project,p_token:token,p_ttl_seconds:900}],
    ["renew_project_lease",{p_project_id:project,p_token:token,p_ttl_seconds:900}],
    ["release_project_lease",{p_project_id:project,p_token:token}],
  ]);
  await assert.rejects(mod.acquireProjectLease({rpc:async()=>({data:false,error:null})},project),/正在/);
  await assert.rejects(mod.acquireProjectLease(client,project,299),/有效期/);
  await assert.rejects(mod.renewProjectLease({rpc:async()=>({data:false,error:null})},lease),/失效/);
});
test("工作成功或失败都释放租约且释放故障不能伪装成功",async()=>{
  assert.equal(typeof mod.withProjectLease,"function", "缺少租约生命周期");
  const calls:string[]=[];
  const client={rpc:async(name:string)=>{calls.push(name);return {data:true,error:null};}};
  assert.equal(await mod.withProjectLease(client,project,async()=>"ok"),"ok");
  await assert.rejects(mod.withProjectLease(client,project,async()=>{throw new Error("构建失败");}),/构建失败/);
  assert.deepEqual(calls,["acquire_project_lease","release_project_lease","acquire_project_lease","release_project_lease"]);
  await assert.rejects(mod.withProjectLease({rpc:async(name:string)=>({data:name!=="release_project_lease",error:null})},project,async()=>"ok"),/释放/);
});

test("租约任务硬超时发送AbortSignal并及时释放",async()=>{
  const calls:string[]=[];
  let observedSignal: AbortSignal | undefined;
  const client={rpc:async(name:string)=>{calls.push(name);return {data:true,error:null};}};
  await assert.rejects(mod.withProjectLease(client,project,async(_lease,signal)=>{
    observedSignal=signal;
    await new Promise(resolve=>setTimeout(resolve,40));
    return "延迟结果";
  },{deadlineMs:5}),/超时/);
  assert.equal(observedSignal?.aborted,true);
  assert.deepEqual(calls,["acquire_project_lease","release_project_lease"]);
});

test("工作错误保留原始对象并独立记录清理失败",async()=>{
  const original=new Error("真实构建故障");
  const cleanup:unknown[]=[];
  const client={rpc:async(name:string)=>({data:name!=="release_project_lease",error:null})};
  await assert.rejects(mod.withProjectLease(client,project,async()=>{throw original;},{onCleanupError:error=>cleanup.push(error)}),error=>error===original);
  assert.equal(cleanup.length,1);
  assert.match((cleanup[0] as Error).message,/释放/);
});

test("云快照提交携带租约令牌且不允许提交另一项目",async()=>{
  assert.equal(typeof mod.saveCloudProjectSnapshot,"function","缺少云租约隔离提交");
  const lease={projectId:project,token,ttlSeconds:900};
  const snapshot={projectId:project,expectedVersion:2,projectName:"应用",summary:"更新",messages:[],files:[],run:{id:token}};
  const client={rpc:async(name:string,payload:Record<string,unknown>)=>{
    assert.equal(name,"save_cloud_project_version");
    assert.deepEqual(payload,{p_project_id:project,p_lease_token:token,p_expected_version:2,p_project_name:"应用",p_summary:"更新",p_messages:[],p_files:[],p_run:{id:token}});
    return {data:3,error:null};
  }};
  assert.equal(await mod.saveCloudProjectSnapshot(client,lease,snapshot),3);
  await assert.rejects(mod.saveCloudProjectSnapshot(client,lease,{...snapshot,projectId:token}),/项目/);
  await assert.rejects(mod.saveCloudProjectSnapshot({rpc:async()=>({data:null,error:{message:"租约已失效"}})},lease,snapshot),/租约已失效/);
});
