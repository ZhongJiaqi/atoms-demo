import assert from "node:assert/strict";
import test from "node:test";
import { restoreProjectVersion } from "../../lib/persistence/restore-version.ts";

const state = { projectId: "123e4567-e89b-42d3-a456-426614174000", projectName: "Todo", summary: "深色", currentVersion: 2, createdAt: "2026-10-14T00:00:00Z", updatedAt: "2026-10-14T00:01:00Z", messages: [], turns: [] };
const project = { projectName: "Todo", summary: "首版", files: [{ path: "src/App.tsx", content: "v1" }, { path: "src/styles.css", content: "css" }] };

test("回滚复制旧源码为新版本，保留历史且先构建保存再切换预览", async () => {
  const steps: string[] = [];
  const result = await restoreProjectVersion({ state, project, targetVersion: 1, expectedVersion: 2 }, {
    async stage(nextState, target) { steps.push("build"); assert.equal(nextState.currentVersion, 3); assert.equal(target.files[0].content, "v1"); return "staging"; },
    async save(nextState, target, turn, expected) { steps.push("save"); assert.equal(expected, 2); assert.equal(turn.version, 3); assert.equal(target.files[0].content, "v1"); assert.equal(nextState.messages.length, 2); return 3; },
    activate(staging) { assert.equal(staging, "staging"); steps.push("activate"); },
    async discard() { steps.push("discard"); },
  });
  assert.deepEqual(steps, ["build", "save", "activate"]);
  assert.equal(result.state.currentVersion, 3);
  assert.equal(state.currentVersion, 2);
  assert.equal(state.messages.length, 0);
  assert.match(result.turn.summary!, /恢复到 v1/);
});

test("保存失败时只清理新沙盒，不切换当前预览或修改原状态", async () => {
  const steps: string[] = [];
  await assert.rejects(restoreProjectVersion({ state, project, targetVersion: 1, expectedVersion: 2 }, {
    async stage() { return "staging"; },
    async save() { throw new Error("数据库保存失败"); },
    activate() { steps.push("activate"); },
    async discard() { steps.push("discard"); },
  }), /数据库保存失败/);
  assert.deepEqual(steps, ["discard"]);
  assert.equal(state.currentVersion, 2);
});

test("旧版本指针冲突在构建前拒绝", async () => {
  let staged = false;
  await assert.rejects(restoreProjectVersion({ state, project, targetVersion: 1, expectedVersion: 1 }, {
    async stage() { staged = true; }, async save() { return 3; }, activate() {}, async discard() {},
  }), /版本已变化/);
  assert.equal(staged, false);
});

test("数据库已提交但响应丢失时确认任务并激活已保存版本", async () => {
  const steps: string[] = [];
  const result = await restoreProjectVersion({ state, project, targetVersion: 1, expectedVersion: 2 }, {
    async stage() { return "staging"; },
    async save() { throw new Error("响应丢失"); },
    async isCommitted(_turnId, version) { steps.push("confirm"); assert.equal(version, 3); return true; },
    activate() { steps.push("activate"); }, async discard() { steps.push("discard"); },
  });
  assert.equal(result.state.currentVersion, 3);
  assert.deepEqual(steps, ["confirm", "activate"]);
});

test("最终状态在保存前同步到待激活运行目录", async () => {
  const steps: string[] = [];
  await restoreProjectVersion({ state, project, targetVersion: 1, expectedVersion: 2 }, {
    async stage() { steps.push("stage"); return "staging"; },
    async finalize(_staged, nextState) { steps.push("finalize"); assert.equal(nextState.turns.at(-1)?.events.at(-1)?.event, "complete"); },
    async save() { steps.push("save"); return 3; },
    activate() { steps.push("activate"); }, async discard() {},
  });
  assert.deepEqual(steps, ["stage", "finalize", "save", "activate"]);
});
