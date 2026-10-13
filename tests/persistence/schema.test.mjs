import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL("../../supabase/migrations/202610130001_phase2_persistence.sql", import.meta.url);

test("持久化迁移定义项目、消息、文件、版本与执行任务", async () => {
  const sql = await readFile(migrationUrl, "utf8");

  for (const table of ["projects", "messages", "project_files", "project_versions", "agent_runs"]) {
    assert.match(sql, new RegExp(`create table public\\.${table}\\b`, "i"), `缺少 ${table} 表`);
  }
  assert.match(sql, /unique\s*\(project_id,\s*path\)/i);
  assert.match(sql, /unique\s*\(project_id,\s*sequence\)/i);
});

test("所有持久化表都启用 RLS 且策略绑定 auth.uid", async () => {
  const sql = await readFile(migrationUrl, "utf8");

  for (const table of ["projects", "messages", "project_files", "project_versions", "agent_runs"]) {
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`, "i"));
  }
  assert.match(sql, /to authenticated[\s\S]*\(select auth\.uid\(\)\)/i);
  assert.doesNotMatch(sql, /to anon\b/i);
});

test("共享 Supabase 实例时只授权 Atoms 自己的 identity sequence", async () => {
  const sql = await readFile(migrationUrl, "utf8");

  assert.doesNotMatch(sql, /grant\s+usage\s*,\s*select\s+on\s+all\s+sequences/i);
  assert.match(sql, /project_files_id_seq/i);
  assert.match(sql, /project_versions_id_seq/i);
});

test("原子保存函数验证调用者身份和期望版本，避免旧任务覆盖新版本", async () => {
  const sql = await readFile(migrationUrl, "utf8");

  assert.match(sql, /create or replace function public\.save_project_version\b/i);
  assert.match(sql, /auth\.uid\(\) is null/i);
  assert.match(sql, /owner_id\s*=\s*\(select auth\.uid\(\)\)/i);
  assert.match(sql, /current_version\s*<>\s*p_expected_version/i);
  assert.match(sql, /for update/i);
});
