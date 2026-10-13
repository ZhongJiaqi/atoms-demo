import assert from "node:assert/strict";
import test from "node:test";

import { safeNextPath } from "../../lib/auth/redirect.ts";
import { authRouteDecision } from "../../lib/auth/policy.ts";
import { hasSupabaseConfig, readSupabaseConfig } from "../../lib/supabase/config.ts";

test("登录成功只允许返回站内目标页面", () => {
  assert.equal(safeNextPath("/?project=123"), "/?project=123");
  assert.equal(safeNextPath("/projects"), "/projects");
  assert.equal(safeNextPath("https://attacker.example/steal"), "/");
  assert.equal(safeNextPath("//attacker.example/steal"), "/");
  assert.equal(safeNextPath(null), "/");
});

test("公开首页可访问，但带项目参数的工作区要求登录并保留目标", () => {
  assert.deepEqual(authRouteDecision("/", ""), { protected: false, next: "/" });
  assert.deepEqual(authRouteDecision("/", "?project=project-1"), {
    protected: true,
    next: "/?project=project-1",
  });
  assert.deepEqual(authRouteDecision("/projects", ""), { protected: true, next: "/projects" });
  assert.deepEqual(authRouteDecision("/login", "?next=%2Fprojects"), { protected: false, next: "/login?next=%2Fprojects" });
});

test("登录返回地址拒绝会被 URL 解析成外站的反斜杠和控制字符", () => {
  for (const value of ["/\\attacker.example/steal", "/\n/attacker.example", "/\t/attacker.example", "/\r/attacker.example"]) {
    const safe = safeNextPath(value);
    assert.equal(safe, "/");
    assert.equal(new URL(safe, "https://atoms.example").origin, "https://atoms.example");
  }
});

test("Supabase 配置缺失时明确报错且不回退到高权限密钥", () => {
  assert.throws(() => readSupabaseConfig({}), /NEXT_PUBLIC_SUPABASE_URL/);
  assert.throws(
    () => readSupabaseConfig({ NEXT_PUBLIC_SUPABASE_URL: "https://demo.supabase.co" }),
    /NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/,
  );
  assert.deepEqual(
    readSupabaseConfig({
      NEXT_PUBLIC_SUPABASE_URL: "https://demo.supabase.co",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_example",
      SUPABASE_SERVICE_ROLE_KEY: "must-not-be-used",
    }),
    { url: "https://demo.supabase.co", publishableKey: "sb_publishable_example" },
  );
});

test("公开页面可以在 Supabase 尚未配置时识别未就绪状态", () => {
  assert.equal(hasSupabaseConfig({}), false);
  assert.equal(hasSupabaseConfig({ NEXT_PUBLIC_SUPABASE_URL: "https://demo.supabase.co" }), false);
  assert.equal(hasSupabaseConfig({
    NEXT_PUBLIC_SUPABASE_URL: "https://demo.supabase.co",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_example",
  }), true);
});
