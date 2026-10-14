import assert from "node:assert/strict";
import test from "node:test";

test("清理请求直接reject时继续尝试Storage、项目和账号且汇总原错误对象",async()=>{
  const module = await import("./test-utils/cloud-cleanup.ts");
  assert.equal(typeof module.cleanupCloudFixture,"function","缺少异常隔离清理流程");
  const calls: string[]=[];
  const errors=[Error("list"),Error("storage"),Error("project"),Error("account")];
  const failures=await module.cleanupCloudFixture({
    listProjects:async()=>{calls.push("list");throw errors[0];},
    removeArtifacts:async(id:string)=>{calls.push(`storage:${id}`);throw errors[1];},
    removeProject:async(id:string)=>{calls.push(`project:${id}`);throw errors[2];},
    removeAccount:async()=>{calls.push("account");throw errors[3];},
  },["own-project"]);
  assert.deepEqual(calls,["list","storage:own-project","project:own-project","account"]);
  assert.deepEqual(failures,errors);
});
