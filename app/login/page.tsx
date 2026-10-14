"use client";

import { FormEvent, useEffect, useState } from "react";

import { safeNextPath } from "@/lib/auth/redirect";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [next, setNext] = useState("/");

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    if (searchParams.get("mode") === "register") setMode("register");
    setMessage(searchParams.get("error") || "");
    setNext(safeNextPath(searchParams.get("next")));
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const supabase = createClient();
      if (mode === "register") {
        const emailRedirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
        const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo } });
        if (error) throw error;
        if (!data.session) {
          setMessage("注册成功，请打开邮箱确认链接后继续。");
          return;
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      window.location.assign(next);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "认证失败，请稍后重试。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <a className="auth-brand" href="/" aria-label="返回 Atoms Demo 首页"><span>◒</span>Atoms Demo</a>
        <div className="auth-tabs" role="tablist" aria-label="认证方式">
          <button aria-selected={mode === "login"} onClick={() => setMode("login")} role="tab" type="button">登录</button>
          <button aria-selected={mode === "register"} onClick={() => setMode("register")} role="tab" type="button">注册</button>
        </div>
        <h1>{mode === "login" ? "欢迎回来" : "创建你的工作区"}</h1>
        <p>{mode === "login" ? "登录后继续生成和修改你的应用。" : "使用邮箱注册，项目将安全保存在你的账户中。"}</p>
        <form onSubmit={submit}>
          <label>邮箱<input autoComplete="email" required type="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label>
          <label>密码<input autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={6} required type="password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
          <button disabled={busy} type="submit">{busy ? "请稍候…" : mode === "login" ? "登录" : "注册"}</button>
        </form>
        {message ? <div className="auth-message" role="status">{message}</div> : null}
      </section>
    </main>
  );
}
