import assert from "node:assert/strict";
import test from "node:test";

import {
  createProjectDraft,
  listUserProjects,
  loadPersistedProject,
  projectSnapshotFromState,
  persistedBundleToRuntime,
  requireProjectAccess,
  requireAuthenticatedUser,
  saveProjectSnapshot,
} from "../../lib/persistence/project-store.ts";

test("服务端只接受 Supabase 验证过的当前用户", async () => {
  await assert.rejects(
    requireAuthenticatedUser({ auth: { getUser: async () => ({ data: { user: null }, error: null }) } }),
    /请先登录/,
  );
  const user = await requireAuthenticatedUser({
    auth: { getUser: async () => ({ data: { user: { id: "user-1", email: "a@example.com" } }, error: null }) },
  });
  assert.equal(user.id, "user-1");
});

test("保存快照只传稳定 project_id 和期望版本，不接受 user_id", async () => {
  let calledWith: Record<string, unknown> | undefined;
  const client = {
    rpc: async (_name: string, payload: Record<string, unknown>) => {
      calledWith = payload;
      return { data: 3, error: null };
    },
  };
  const version = await saveProjectSnapshot(client, {
    projectId: "project-1",
    expectedVersion: 2,
    projectName: "Todo App",
    summary: "增加深色模式",
    messages: [],
    files: [{ path: "src/App.tsx", content: "export default function App(){}" }],
    run: { id: "run-1" },
  });

  assert.equal(version, 3);
  assert.equal(calledWith?.p_project_id, "project-1");
  assert.equal(calledWith?.p_expected_version, 2);
  assert.equal("owner_id" in (calledWith || {}), false);
  assert.equal("p_owner_id" in (calledWith || {}), false);
});

test("数据库保存失败时向上抛出，禁止界面假装保存成功", async () => {
  await assert.rejects(
    saveProjectSnapshot(
      { rpc: async () => ({ data: null, error: { message: "project version conflict" } }) },
      {
        projectId: "project-1",
        expectedVersion: 1,
        projectName: "Todo App",
        summary: "修改",
        messages: [],
        files: [],
        run: { id: "run-1" },
      },
    ),
    /project version conflict/,
  );
});

test("创建项目时 owner_id 只能来自已验证会话", async () => {
  let inserted: Record<string, unknown> | undefined;
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: "verified-user" } }, error: null }) },
    from(table: string) {
      assert.equal(table, "projects");
      return {
        insert: async (value: Record<string, unknown>) => {
          inserted = value;
          return { error: null };
        },
      };
    },
  };

  await createProjectDraft(client, { projectId: "project-1", name: "正在创建项目" });
  assert.deepEqual(inserted, {
    id: "project-1",
    owner_id: "verified-user",
    name: "正在创建项目",
    summary: "",
    current_version: 0,
  });
});

test("Agent 状态按消息顺序映射为一个原子版本快照", () => {
  const snapshot = projectSnapshotFromState(
    {
      projectId: "project-1",
      projectName: "Todo App",
      summary: "支持深色模式",
      currentVersion: 2,
      createdAt: "2026-10-13T00:00:00.000Z",
      updatedAt: "2026-10-13T00:02:00.000Z",
      messages: [
        { id: "message-1", role: "user", content: "创建 Todo", createdAt: "2026-10-13T00:00:00.000Z", turnId: "turn-1" },
        { id: "message-2", role: "assistant", content: "已创建", createdAt: "2026-10-13T00:01:00.000Z", turnId: "turn-1" },
      ],
      turns: [],
    },
    { projectName: "Todo App", summary: "支持深色模式", files: [{ path: "src/App.tsx", content: "code" }] },
    {
      id: "turn-1",
      mode: "create",
      requirement: "创建 Todo",
      status: "completed",
      startedAt: "2026-10-13T00:00:00.000Z",
      completedAt: "2026-10-13T00:01:00.000Z",
      events: [],
    },
    1,
  );

  assert.equal(snapshot.expectedVersion, 1);
  assert.deepEqual(snapshot.messages.map((message) => message.sequence), [0, 1]);
  assert.deepEqual(snapshot.messages[0], {
    id: "message-1",
    role: "user",
    content: "创建 Todo",
    turn_id: "turn-1",
    created_at: "2026-10-13T00:00:00.000Z",
    sequence: 0,
  });
  assert.equal("turnId" in snapshot.messages[0]!, false);
  assert.deepEqual(snapshot.files, [{ path: "src/App.tsx", content: "code" }]);
  assert.equal(snapshot.run.id, "turn-1");
  assert.equal("ownerId" in snapshot, false);
});

test("修改项目之前通过 RLS 查询验证项目访问权", async () => {
  const client = {
    from(table: string) {
      assert.equal(table, "projects");
      return {
        select(columns: string) {
          assert.equal(columns, "id,current_version");
          return {
            eq(column: string, value: string) {
              assert.deepEqual([column, value], ["id", "project-1"]);
              return { single: async () => ({ data: { id: "project-1", current_version: 2 }, error: null }) };
            },
          };
        },
      };
    },
  };
  assert.deepEqual(await requireProjectAccess(client, "project-1"), { projectId: "project-1", currentVersion: 2 });

  await assert.rejects(
    requireProjectAccess({
      from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: null, error: { message: "0 rows" } }) }) }) }),
    }, "other-project"),
    /无权访问/,
  );
});

test("数据库记录恢复为 Agent 可继续修改的原始状态和源码", () => {
  const restored = persistedBundleToRuntime({
    project: {
      id: "project-1",
      name: "Todo App",
      summary: "深色 Todo",
      current_version: 2,
      created_at: "2026-10-13T00:00:00.000Z",
      updated_at: "2026-10-13T00:02:00.000Z",
    },
    messages: [
      { id: "message-1", role: "user", content: "创建 Todo", turn_id: "turn-1", created_at: "2026-10-13T00:00:00.000Z" },
      { id: "message-2", role: "assistant", content: "已创建", turn_id: "turn-1", created_at: "2026-10-13T00:01:00.000Z" },
    ],
    files: [
      { path: "src/styles.css", content: "body{}" },
      { path: "src/App.tsx", content: "export default function App(){return null}" },
    ],
    runs: [{
      id: "turn-1",
      mode: "create",
      requirement: "创建 Todo",
      status: "completed",
      model: "model-1",
      summary: "已创建",
      events: [],
      changed_files: ["src/App.tsx", "src/styles.css"],
      deleted_files: [],
      build_attempts: 1,
      version: 1,
      error: null,
      started_at: "2026-10-13T00:00:00.000Z",
      completed_at: "2026-10-13T00:01:00.000Z",
    }],
  });

  assert.equal(restored.state.projectId, "project-1");
  assert.equal(restored.state.currentVersion, 2);
  assert.equal(restored.state.messages[0]?.turnId, "turn-1");
  assert.equal(restored.state.turns[0]?.version, 1);
  assert.deepEqual(restored.project.files.map((file) => file.path), ["src/App.tsx", "src/styles.css"]);
});

test("历史项目倒序查询且恢复读取全部持久化实体", async () => {
  const calls: string[] = [];
  const rows: Record<string, unknown> = {
    projects: [{ id: "project-1", name: "Todo", summary: "", current_version: 1, created_at: "a", updated_at: "b" }],
    messages: [],
    project_files: [{ path: "src/App.tsx", content: "code" }, { path: "src/styles.css", content: "css" }],
    agent_runs: [],
  };
  const client = {
    from(table: string) {
      calls.push(`from:${table}`);
      const chain = {
        select() { return chain; },
        eq() { return chain; },
        order(column: string, options: { ascending: boolean }) {
          calls.push(`order:${table}:${column}:${options.ascending}`);
          return Promise.resolve({ data: rows[table], error: null });
        },
        single() {
          const values = rows[table] as unknown[];
          return Promise.resolve({ data: values[0], error: null });
        },
      };
      return chain;
    },
  };

  const projects = await listUserProjects(client);
  assert.equal(projects[0]?.id, "project-1");
  assert.ok(calls.includes("order:projects:updated_at:false"));

  const bundle = await loadPersistedProject(client, "project-1");
  assert.equal(bundle.project.id, "project-1");
  assert.deepEqual(new Set(calls.filter((call) => call.startsWith("from:"))), new Set([
    "from:projects",
    "from:messages",
    "from:project_files",
    "from:agent_runs",
  ]));
});

test("历史列表查询完整版本记录并按版本倒序返回，而非只保留最新版本", async () => {
  let columns = "";
  const client = {
    from(table: string) {
      assert.equal(table, "projects");
      const chain = {
        select(value = "*") { columns = value; return chain; },
        eq() { return chain; },
        async order(column: string, options: { ascending: boolean }) {
          assert.equal(column, "updated_at");
          assert.equal(options.ascending, false);
          return { data: [{ id: "same-project", current_version: 2, versions: [
            { version: 1, name: "个人主页", summary: "首次创建", created_at: "2026-10-14T00:00:00Z" },
            { version: 2, name: "个人主页", summary: "增加深色模式", created_at: "2026-10-14T00:01:00Z" },
          ] }], error: null };
        },
        async single() { return { data: null, error: null }; },
      };
      return chain;
    },
  };
  const projects = await listUserProjects(client);
  assert.match(columns, /versions:project_versions\(version,name,summary,created_at\)/);
  assert.deepEqual(projects[0].versions.map((version) => version.version), [2, 1]);
  assert.equal(projects[0].versions[1].summary, "首次创建");
});
