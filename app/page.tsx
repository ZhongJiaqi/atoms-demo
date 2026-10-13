"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type TimelineItem = {
  id: number;
  event: string;
  data: Record<string, unknown>;
  at: string;
};

type GenerationResult = {
  mode: "create" | "modify";
  version: number;
  projectId: string;
  projectName: string;
  summary: string;
  model: string;
  buildAttempts: number;
  previewUrl: string;
  generatedFiles: string[];
  changedFiles: string[];
  deletedFiles: string[];
};

type ConversationTurn = {
  id: string;
  requirement: string;
  status: "running" | "completed" | "failed";
  timeline: TimelineItem[];
  result?: GenerationResult;
  error?: string;
};

type SourceFile = { path: string; content: string };
type ViewerMode = "preview" | "code";
type PreviewDevice = "desktop" | "mobile";
type MobilePane = "chat" | "viewer";
type SaveStatus = "idle" | "saving" | "saved" | "error";

type PersistedTurn = {
  id: string;
  mode: "create" | "modify";
  requirement: string;
  status: "running" | "completed" | "failed";
  model?: string;
  summary?: string;
  changedFiles?: string[];
  deletedFiles?: string[];
  buildAttempts?: number;
  version?: number;
  error?: string;
  events: Array<{ event: string; data: Record<string, unknown>; at: string }>;
};

type RestoredProject = {
  projectId: string;
  projectName: string;
  summary: string;
  currentVersion: number;
  turns: PersistedTurn[];
  files: SourceFile[];
  previewUrl: string;
};

type ProjectSummary = {
  id: string;
  name: string;
  summary: string;
  current_version: number;
  updated_at: string;
  versions: Array<{ version: number; name: string; summary: string; created_at: string }>;
};

const EVENT_LABELS: Record<string, string> = {
  accepted: "开始任务",
  project_loaded: "读取项目文件",
  model_started: "分析需求并规划实现",
  model_completed: "生成实现方案",
  files_saved: "写入项目文件",
  build_started: "运行代码检查与生产构建",
  build_failed: "构建未通过",
  repair_started: "根据日志自动修复",
  repair_completed: "修复已写入",
  preview_started: "准备应用预览",
  complete: "任务完成",
  error: "任务失败",
};

const MIN_CREATE_PROMPT_LENGTH = 4;
const MIN_MODIFY_PROMPT_LENGTH = 2;

const AGENT_FACES = ["🧑🏻‍💻", "🧑🏼‍🎨", "🧑🏽‍🔬", "🧑🏻‍🚀", "🧑🏾‍💼", "🧑🏼‍🔧", "🧑🏽‍🏫", "🧑🏻‍🚀"];

function parseBlock(block: string) {
  if (!block || block.startsWith(":")) return null;
  let event = "message";
  const data: string[] = [];
  for (const line of block.split("\n")) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    if (line.startsWith("data:")) data.push(line.slice(5).trim());
  }
  if (!data.length) return null;
  return { event, data: JSON.parse(data.join("\n")) as Record<string, unknown> };
}

function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <span className={`atoms-logo ${compact ? "is-compact" : ""}`} aria-label="Atoms">
      <i /><i /><i />
      {!compact ? <b>Atoms</b> : null}
    </span>
  );
}

function LandingPage({
  requirement,
  setRequirement,
  submit,
  openHistory,
  projects,
  signedIn,
  projectsLoading,
  historyError,
  logout,
}: {
  requirement: string;
  setRequirement: (value: string) => void;
  submit: (event: FormEvent) => void;
  openHistory: () => void;
  projects: ProjectSummary[];
  signedIn: boolean;
  projectsLoading: boolean;
  historyError: string;
  logout: () => void;
}) {
  return (
    <main className="landing-page">
      <nav className="landing-nav" aria-label="主导航">
        <Logo />
        <div className="landing-links" aria-label="产品导航">
          <span>资源⌄</span><span>社区</span><span>关于</span><span>定价</span>
        </div>
        <div className="landing-auth">
          {signedIn ? <button className="soft-button" onClick={logout} type="button">退出登录</button> : <><a className="soft-button" href="/login">登录</a><a className="primary-button" href="/login?mode=register">注册</a></>}
        </div>
      </nav>

      <section className="landing-hero" id="hero">
        <div className="notice-pill"><span>Notice</span><i />Atoms Demo 已支持真实生成与多轮修改<b>×</b></div>
        <div className="agent-stack" aria-label="AI 智能体团队">
          {AGENT_FACES.map((face, index) => <span key={`${face}-${index}`}>{face}</span>)}
        </div>
        <h1>把想法变成可运行的产品</h1>
        <p>AI 员工为你理解需求、编写代码并验证结果。几分钟内完成，无需编码。</p>
        <form className="hero-composer" onSubmit={submit}>
          <label className="sr-only" htmlFor="hero-requirement">描述你想创建的应用</label>
          <textarea
            autoFocus
            id="hero-requirement"
            maxLength={2000}
            onChange={(event) => setRequirement(event.target.value)}
            placeholder="例如：创建一个支持优先级和深色模式的 Todo App"
            rows={3}
            value={requirement}
          />
          <div className="hero-composer-actions">
            <button aria-label="添加附件" className="circle-button" type="button">＋</button>
            <button className="start-button" disabled={requirement.trim().length < MIN_CREATE_PROMPT_LENGTH} type="submit">
              开始 <span>→</span>
            </button>
          </div>
        </form>
        <section className="home-projects" aria-label="我的项目">
          <header><h2>我的项目</h2><button aria-label="历史项目" onClick={openHistory} type="button">查看历史项目 ↗</button></header>
          {historyError ? <p className="home-projects-empty" role="alert">{historyError}</p> : projectsLoading ? <p className="home-projects-empty" role="status">正在读取你的项目…</p> : signedIn && projects.length ? (
            <div className="home-project-grid">{projects.map((project) => (
              <a className="home-project-card" href={`/?project=${project.id}`} key={project.id}>
                <div className="home-project-cover" aria-hidden="true">‹/›</div>
                <h3>{project.name}</h3><p>{project.summary || "尚未生成成功版本"}</p><small>v{project.current_version} · {new Date(project.updated_at).toLocaleString("zh-CN")}</small>
              </a>
            ))}</div>
          ) : <p className="home-projects-empty">{signedIn ? "还没有项目，描述你的想法开始创建。" : "登录后，你的项目会出现在这里。"}</p>}
        </section>
      </section>
    </main>
  );
}

function AgentTrace({ turn, restoreVersion, restoreDisabled }: { turn: ConversationTurn; restoreVersion: (version: number) => void; restoreDisabled: boolean }) {
  return (
    <div className="agent-response">
      <header className="agent-identity">
        <span className="agent-avatar">🦉</span>
        <div><strong>Alex</strong><i />工程师</div>
        {turn.status === "running" ? <small>正在工作</small> : null}
      </header>
      <p className="agent-intent">
        {turn.status === "running"
          ? "我正在确认需求边界，修改项目文件并运行构建验证。"
          : turn.status === "failed"
            ? "本轮没有生成可用版本，上一稳定预览保持不变。"
            : "代码检查与构建已通过，结果已保存为可继续修改的版本。"}
      </p>
      <div className="tool-steps">
        {turn.timeline
          .filter((item) => !["accepted", "complete"].includes(item.event))
          .map((item, index, items) => (
            <div className={`tool-step ${item.event.includes("failed") ? "is-error" : ""}`} key={`${turn.id}-${item.id}`}>
              <span className="step-marker">{index === items.length - 1 && turn.status === "running" ? "•••" : "✓"}</span>
              <div>
                <strong>{EVENT_LABELS[item.event] || item.event}</strong>
                <p>{String(item.data.message || item.data.projectName || "状态已更新")}</p>
                {Array.isArray(item.data.files) && item.data.files.length ? (
                  <div className="file-list">
                    {(item.data.files as string[]).map((file) => <code key={`${item.id}-${file}`}>{file}</code>)}
                  </div>
                ) : null}
                {item.event === "build_failed" && item.data.log ? <pre>{String(item.data.log).slice(-1800)}</pre> : null}
              </div>
            </div>
          ))}
      </div>
      {turn.result ? (
        <>
          <p className="agent-summary">{turn.result.summary}</p>
          <article className="version-card">
            <div><strong>版本 {turn.result.version}</strong><span>{turn.result.summary}</span></div>
            <button aria-label={`恢复到版本 ${turn.result.version}`} disabled={restoreDisabled} onClick={() => restoreVersion(turn.result!.version)} title="查看版本历史并恢复" type="button">⌁</button>
          </article>
          <div className="message-actions" aria-label="消息操作"><span>▢</span><span>♧</span><span>♤</span><span>···</span></div>
        </>
      ) : null}
      {turn.error ? (
        <div className="chat-error" role="alert">
          <strong>本轮构建未完成</strong><p>{turn.error}</p><span>已恢复并保留上一成功版本。</span>
        </div>
      ) : null}
    </div>
  );
}

export default function CodingAgentPage() {
  const [requirement, setRequirement] = useState("");
  const [turns, setTurns] = useState<ConversationTurn[]>([]);
  const [result, setResult] = useState<GenerationResult | null>(null);
  const [running, setRunning] = useState(false);
  const [viewerMode, setViewerMode] = useState<ViewerMode>("preview");
  const [previewDevice, setPreviewDevice] = useState<PreviewDevice>("desktop");
  const [mobilePane, setMobilePane] = useState<MobilePane>("chat");
  const [sourceFiles, setSourceFiles] = useState<SourceFile[]>([]);
  const [activeFile, setActiveFile] = useState("src/App.tsx");
  const [refreshKey, setRefreshKey] = useState(0);
  const [consoleOpen, setConsoleOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [restoring, setRestoring] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [versionHistoryOpen, setVersionHistoryOpen] = useState(false);
  const [projectVersions, setProjectVersions] = useState<ProjectSummary["versions"]>([]);
  const [versionHistoryLoading, setVersionHistoryLoading] = useState(false);
  const [versionHistoryError, setVersionHistoryError] = useState("");
  const [restoringVersion, setRestoringVersion] = useState<number | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const chatEndRef = useRef<HTMLDivElement>(null);

  const latestTurn = turns.at(-1);
  const isWorkspace = turns.length > 0;
  const currentSource = sourceFiles.find((file) => file.path === activeFile) ?? sourceFiles[0];
  const previewIsCrossOrigin = result && typeof window !== "undefined"
    ? new URL(result.previewUrl).origin !== window.location.origin
    : false;

  useEffect(() => {
    void (async () => {
      try {
        const { data } = await createClient().auth.getUser();
        setSignedIn(Boolean(data.user));
        if (data.user) await loadProjectHistory(false);
      } catch { setSignedIn(false); }
    })();
  }, []);

  useEffect(() => {
    if (isWorkspace) chatEndRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [isWorkspace, latestTurn?.timeline.length, latestTurn?.status]);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(""), 2600);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  useEffect(() => {
    const projectId = new URLSearchParams(window.location.search).get("project");
    if (!projectId) {
      const pending = window.sessionStorage.getItem("atoms-pending-prompt");
      if (pending) {
        setRequirement(pending);
        window.sessionStorage.removeItem("atoms-pending-prompt");
      }
      return;
    }
    setRestoring(true);
    void restoreWorkspace(projectId).finally(() => setRestoring(false));
    // The project URL is the restore trigger; subsequent changes reuse the active state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const workspaceStatus = useMemo(() => {
    if (running) return result ? `正在修改版本 ${result.version + 1}` : "正在生成首个版本";
    if (latestTurn?.status === "failed") return "本轮失败，已保留稳定版本";
    if (result) return `版本 ${result.version} 已就绪`;
    return "正在启动智能体";
  }, [latestTurn?.status, result, running]);

  function updateTurn(id: string, update: (turn: ConversationTurn) => ConversationTurn) {
    setTurns((current) => current.map((turn) => (turn.id === id ? update(turn) : turn)));
  }

  async function loadSourceFiles(projectId: string) {
    try {
      const response = await fetch(`/api/projects/${projectId}`, { cache: "no-store" });
      if (!response.ok) return;
      const data = (await response.json()) as { files?: SourceFile[] };
      if (Array.isArray(data.files)) {
        setSourceFiles(data.files);
        setActiveFile((current) => data.files?.some((file) => file.path === current) ? current : data.files?.[0]?.path || "");
      }
    } catch {
      // 预览仍可使用；Code 面板保持空状态。
    }
  }

  async function restoreWorkspace(projectId: string) {
    try {
      const response = await fetch(`/api/projects/${projectId}/resume`, { method: "POST", cache: "no-store" });
      if (response.status === 401) {
        window.location.assign(`/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`);
        return;
      }
      const data = (await response.json()) as RestoredProject & { error?: string };
      if (!response.ok) throw new Error(data.error || "项目恢复失败。");
      const restoredTurns = data.turns.map<ConversationTurn>((turn) => {
        const turnResult: GenerationResult | undefined = turn.status === "completed" && turn.version
          ? {
              mode: turn.mode,
              version: turn.version,
              projectId: data.projectId,
              projectName: data.projectName,
              summary: turn.summary || data.summary,
              model: turn.model || "已保存版本",
              buildAttempts: turn.buildAttempts || 1,
              previewUrl: data.previewUrl,
              generatedFiles: data.files.map((file) => file.path),
              changedFiles: turn.changedFiles || [],
              deletedFiles: turn.deletedFiles || [],
            }
          : undefined;
        return {
          id: turn.id,
          requirement: turn.requirement,
          status: turn.status,
          timeline: turn.events.map((event, index) => ({
            id: index + 1,
            event: event.event,
            data: event.data,
            at: new Date(event.at).toLocaleTimeString("zh-CN", { hour12: false }),
          })),
          result: turnResult,
          error: turn.error,
        };
      });
      const latest = [...restoredTurns].reverse().find((turn) => turn.result?.version === data.currentVersion)?.result;
      if (!latest) throw new Error("项目缺少当前成功版本记录。");
      setTurns(restoredTurns);
      setResult({ ...latest, previewUrl: data.previewUrl });
      setSourceFiles(data.files);
      setActiveFile(data.files[0]?.path || "");
      setSaveStatus("saved");
      return true;
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "项目恢复失败。");
      setSaveStatus("error");
      return false;
    }
  }

  async function loadProjectHistory(open = true) {
    if (open) setHistoryOpen(true);
    setProjectsLoading(true);
    setHistoryError("");
    try {
      const response = await fetch("/api/projects", { cache: "no-store" });
      if (response.status === 401) {
        window.location.assign(`/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`);
        return;
      }
      const data = (await response.json()) as { projects?: ProjectSummary[]; error?: string };
      if (!response.ok) throw new Error(data.error || "历史项目读取失败。");
      setProjects(data.projects || []);
    } catch (error) {
      const message = error instanceof Error ? error.message : "历史项目读取失败。";
      setNotice(message); setHistoryError(message);
    } finally { setProjectsLoading(false); }
  }

  async function logout() {
    await fetch("/auth/logout", { method: "POST" });
    window.location.assign("/");
  }

  async function loadVersionHistory() {
    if (!result) return;
    setVersionHistoryOpen(true);
    setVersionHistoryLoading(true);
    setVersionHistoryError("");
    try {
      const response = await fetch("/api/projects", { cache: "no-store" });
      const data = await response.json() as { projects?: ProjectSummary[]; error?: string };
      if (!response.ok) throw new Error(data.error || "历史版本读取失败。");
      setProjectVersions(data.projects?.find((project) => project.id === result.projectId)?.versions || []);
    } catch (error) { setVersionHistoryError(error instanceof Error ? error.message : "历史版本读取失败。"); }
    finally { setVersionHistoryLoading(false); }
  }

  async function restoreVersion(version: number) {
    if (!result || running || restoringVersion !== null || version === result.version) return;
    setRestoringVersion(version);
    setVersionHistoryError("");
    setSaveStatus("saving");
    try {
      const response = await fetch(`/api/projects/${result.projectId}/restore`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version, expectedVersion: result.version }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "历史版本恢复失败。");
      if (!await restoreWorkspace(result.projectId)) throw new Error("版本已保存，但工作区加载失败，请刷新后重试。");
      setRefreshKey((key) => key + 1);
      setVersionHistoryOpen(false);
      setNotice(`已恢复到 v${version} 的代码，原有历史已保留`);
    } catch (error) {
      setVersionHistoryError(error instanceof Error ? error.message : "版本恢复失败。");
      setSaveStatus("error");
    } finally { setRestoringVersion(null); }
  }

  async function submitPrompt(prompt: string) {
    const minimumLength = result ? MIN_MODIFY_PROMPT_LENGTH : MIN_CREATE_PROMPT_LENGTH;
    if (prompt.length < minimumLength || running || restoringVersion !== null) return;
    const localTurnId = crypto.randomUUID();
    const activeProjectId = result?.projectId;
    setTurns((current) => [
      ...current,
      { id: localTurnId, requirement: prompt, status: "running", timeline: [] },
    ]);
    setRequirement("");
    setRunning(true);
    setSaveStatus("saving");
    setMobilePane("chat");
    setViewerMode("preview");

    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
        body: JSON.stringify({ requirement: prompt, projectId: activeProjectId }),
      });
      if (!response.ok || !response.body) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        if (response.status === 401) {
          window.sessionStorage.setItem("atoms-pending-prompt", prompt);
          window.location.assign("/login?next=/");
          return;
        }
        throw new Error(body?.error || `生成接口返回 HTTP ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let sequence = 0;
      while (true) {
        const { done, value } = await reader.read();
        buffer += decoder.decode(value, { stream: !done });
        const blocks = buffer.split("\n\n");
        buffer = blocks.pop() ?? "";
        for (const block of blocks) {
          const item = parseBlock(block);
          if (!item) continue;
          sequence += 1;
          const timelineItem = {
            ...item,
            id: sequence,
            at: new Date().toLocaleTimeString("zh-CN", { hour12: false }),
          };
          updateTurn(localTurnId, (turn) => ({ ...turn, timeline: [...turn.timeline, timelineItem] }));
          if (item.event === "complete") {
            const completed = item.data as unknown as GenerationResult;
            setResult(completed);
            updateTurn(localTurnId, (turn) => ({ ...turn, status: "completed", result: completed }));
            await loadSourceFiles(completed.projectId);
            window.history.replaceState(null, "", `/?project=${completed.projectId}`);
            setSaveStatus("saved");
          }
          if (item.event === "error") throw new Error(String(item.data.message || "生成失败"));
        }
        if (done) break;
      }
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "生成流程发生未知错误。";
      updateTurn(localTurnId, (turn) => ({ ...turn, status: "failed", error: message }));
      setSaveStatus("error");
    } finally {
      setRunning(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void submitPrompt(requirement.trim());
  }

  function startNewProject() {
    if (running) return;
    setTurns([]);
    setResult(null);
    setSourceFiles([]);
    setRequirement("");
    setViewerMode("preview");
    setSaveStatus("idle");
    window.history.replaceState(null, "", "/");
  }

  const projectHistory = historyOpen ? (
    <aside className="project-history" aria-label="历史项目">
      <header><div><strong>历史项目</strong><span>按最近修改排序</span></div><button aria-label="关闭历史项目" onClick={() => setHistoryOpen(false)} type="button">×</button></header>
      <div>
        {projects.length ? projects.map((project) => (
          <div className="history-project" key={project.id}>
          <a className={project.id === result?.projectId ? "is-active" : ""} href={`/?project=${project.id}`}>
            <strong>{project.name}</strong><span>{project.summary || "尚未生成成功版本"}</span><small>v{project.current_version} · {new Date(project.updated_at).toLocaleString("zh-CN")}</small>
          </a>
          {project.versions?.length ? (
            <details className="project-versions" open>
              <summary>历史版本 · {project.versions.length} 个</summary>
              <ol aria-label={`${project.name}的历史版本`}>
                {project.versions.map((version) => (
                  <li data-testid="project-version" key={version.version}>
                    <div><strong>v{version.version}</strong>{version.version === project.current_version ? <span>当前版本</span> : null}<time>{new Date(version.created_at).toLocaleString("zh-CN")}</time></div>
                    <p>{version.summary}</p>
                  </li>
                ))}
              </ol>
            </details>
          ) : null}
          </div>
        )) : <p>还没有历史项目。</p>}
      </div>
    </aside>
  ) : null;

  if (restoring) {
    return <main className="restore-screen"><span className="building-orbit"><i /><i /><i /></span><h1>正在恢复项目</h1><p>读取聊天与源码，并重新启动安全预览…</p></main>;
  }

  if (!isWorkspace) {
    return <><LandingPage requirement={requirement} setRequirement={setRequirement} submit={submit} openHistory={() => void loadProjectHistory()} projects={projects} signedIn={signedIn} projectsLoading={projectsLoading} historyError={historyError} logout={() => void logout()} /><div className="landing-project-history">{projectHistory}</div></>;
  }

  return (
    <main className="workspace-shell">
      <aside className="global-rail" aria-label="全局导航">
        <Logo compact />
        <div className="rail-actions">
          <button aria-label="新建项目" disabled={running} onClick={startNewProject} title="新建项目" type="button">＋</button>
          <button aria-label="历史项目" className="is-active" onClick={() => void loadProjectHistory()} title="历史项目" type="button">◇</button>
          <button aria-label="项目文件" onClick={() => { setViewerMode("code"); setMobilePane("viewer"); }} title="项目文件" type="button">▱</button>
        </div>
        <span className="rail-spacer" />
        <button aria-label="退出登录" className="account-button" onClick={() => void logout()} title="退出登录" type="button">J</button>
      </aside>

      <header className="chat-header">
        <div><strong>{result?.projectName || "正在创建项目"}</strong><span>⌄</span></div>
        <div className="chat-header-actions"><button aria-label="历史记录" onClick={() => void loadVersionHistory()} type="button">↶</button><button aria-label="收起对话" onClick={() => setNotice("移动端可通过底部标签切换，桌面折叠将在下一阶段开放")} type="button">≪</button></div>
      </header>

      <header className="viewer-header">
        <div className="viewer-mode-tabs" role="tablist" aria-label="查看模式">
          <button aria-selected={viewerMode === "preview"} onClick={() => setViewerMode("preview")} role="tab" type="button">▣ 预览</button>
          <button aria-selected={viewerMode === "code"} onClick={() => setViewerMode("code")} role="tab" type="button">‹/› 代码</button>
        </div>
        <div className="workspace-actions">
          {running ? <button className="follow-button" type="button">跟随智能体</button> : null}
          <button onClick={() => { void navigator.clipboard.writeText(window.location.href); setNotice("项目链接已复制"); }} type="button">分享</button>
          <button className="publish-button" disabled={running || !result} onClick={() => result && window.open(result.previewUrl, "_blank", "noopener,noreferrer")} type="button">发布</button>
        </div>
      </header>

      <section className={`chat-column ${mobilePane === "chat" ? "is-mobile-active" : ""}`}>
        {projectHistory}
        <div className="conversation-scroll">
          <div className="session-status"><i className={running || saveStatus === "saving" ? "is-running" : ""} /><span>{workspaceStatus} · {saveStatus === "saving" ? "正在保存" : saveStatus === "saved" ? "已保存" : saveStatus === "error" ? "保存失败" : "尚未保存"}</span></div>
          {turns.map((turn, turnIndex) => (
            <article className="conversation-turn" data-status={turn.status} key={turn.id}>
              <div className="user-bubble"><small>你 · 第 {turnIndex + 1} 轮</small><p>{turn.requirement}</p></div>
              <AgentTrace turn={turn} restoreDisabled={running || restoringVersion !== null} restoreVersion={() => void loadVersionHistory()} />
            </article>
          ))}
          <div ref={chatEndRef} />
        </div>

        <form className="chat-composer" onSubmit={submit}>
          <label className="sr-only" htmlFor="workspace-requirement">继续修改应用</label>
          <textarea
            id="workspace-requirement"
            maxLength={2000}
            onChange={(event) => setRequirement(event.target.value)}
            placeholder={result ? "让智能体继续修改…" : "正在创建首个版本…"}
            rows={3}
            value={requirement}
          />
          <div>
            <button aria-label="添加附件" className="circle-button" type="button">＋</button>
            <span>{result ? `v${result.version} · ${result.projectId.slice(0, 8)}` : "真实模型与沙盒构建"}</span>
            {running ? (
              <button aria-label="任务运行中" className="stop-button" onClick={() => setNotice("任务正在受控沙盒中执行，请等待本轮结算")} type="button">■</button>
            ) : (
              <button aria-label="发送修改需求" className="send-button" disabled={restoringVersion !== null || requirement.trim().length < MIN_MODIFY_PROMPT_LENGTH} type="submit">↑</button>
            )}
          </div>
        </form>
      </section>

      <section className={`viewer-column ${mobilePane === "viewer" ? "is-mobile-active" : ""}`}>
        <div className="app-viewer-shell">
          <div className="app-viewer-toolbar">
            <div className="device-controls">
              <button aria-label="桌面预览" className={previewDevice === "desktop" ? "is-active" : ""} onClick={() => setPreviewDevice("desktop")} type="button">▱</button>
              <button aria-label="手机预览" className={previewDevice === "mobile" ? "is-active" : ""} onClick={() => setPreviewDevice("mobile")} type="button">▯</button>
            </div>
            <button aria-label="刷新预览" onClick={() => setRefreshKey((value) => value + 1)} type="button">↻</button>
            <div className="route-select"><span>⌂</span><b>Home</b><i>⌄</i></div>
            {result ? <a aria-label="在新标签页打开" href={result.previewUrl} rel="noreferrer" target="_blank">↗</a> : <span />}
            <button className={consoleOpen ? "is-active" : ""} onClick={() => setConsoleOpen((value) => !value)} type="button">‹› 控制台</button>
          </div>

          {viewerMode === "preview" ? (
            <div className={`preview-canvas is-${previewDevice}`}>
              {result ? (
                <div className="preview-frame-wrap">
                  {running ? <div className="pending-preview"><i />正在构建新版本，当前展示 v{result.version}</div> : null}
                  <iframe
                    key={`${result.previewUrl}-v${result.version}-${refreshKey}`}
                    data-project-id={result.projectId}
                    data-testid="generated-preview"
                    data-version={result.version}
                    sandbox={previewIsCrossOrigin ? "allow-scripts allow-forms allow-same-origin" : "allow-scripts allow-forms"}
                    src={result.previewUrl}
                    title={`${result.projectName} v${result.version} 预览`}
                  />
                </div>
              ) : latestTurn?.status === "failed" ? (
                <div className="viewer-empty is-error"><span>!</span><h2>首个版本构建失败</h2><p>错误详情已显示在对话中。你可以调整需求后重新开始。</p></div>
              ) : (
                <div className="viewer-building"><div className="building-orbit"><i /><i /><i /></div><h2>智能体正在构建应用</h2><p>模型生成、文件写入和沙盒验证状态会实时显示在左侧。</p></div>
              )}
            </div>
          ) : (
            <div className="code-viewer">
              <aside>
                <strong>项目文件</strong>
                {sourceFiles.map((file) => (
                  <button className={currentSource?.path === file.path ? "is-active" : ""} key={file.path} onClick={() => setActiveFile(file.path)} type="button">{file.path}</button>
                ))}
              </aside>
              <section>
                <header><span>{currentSource?.path || "等待源码"}</span><small>只读</small></header>
                {currentSource ? <pre><code>{currentSource.content}</code></pre> : <div className="code-empty">首个版本完成后，这里会显示模型真实生成的源码。</div>}
              </section>
            </div>
          )}

          {consoleOpen ? (
            <div className="console-drawer">
              <header><strong>控制台</strong><button aria-label="关闭控制台" onClick={() => setConsoleOpen(false)} type="button">×</button></header>
              <p><i />{latestTurn?.status === "failed" ? "最近一次任务失败，已恢复上一稳定版本。" : result ? `v${result.version} 构建通过，预览进程运行中。` : "等待首个构建结果。"}</p>
            </div>
          ) : null}
        </div>
      </section>

      <nav className="mobile-workspace-nav" aria-label="工作区视图">
        <button className={mobilePane === "chat" ? "is-active" : ""} onClick={() => setMobilePane("chat")} type="button">对话</button>
        <button className={mobilePane === "viewer" && viewerMode === "preview" ? "is-active" : ""} onClick={() => { setMobilePane("viewer"); setViewerMode("preview"); }} type="button">预览</button>
        <button className={mobilePane === "viewer" && viewerMode === "code" ? "is-active" : ""} onClick={() => { setMobilePane("viewer"); setViewerMode("code"); }} type="button">代码</button>
      </nav>

      {versionHistoryOpen ? (
        <div className="version-history-backdrop" onClick={() => restoringVersion === null && setVersionHistoryOpen(false)}>
          <section className="version-history-panel" role="dialog" aria-modal="true" aria-label="历史记录" onClick={(event) => event.stopPropagation()}>
            <header><h2>历史记录</h2><button aria-label="关闭历史记录" disabled={restoringVersion !== null} onClick={() => setVersionHistoryOpen(false)} type="button">×</button></header>
            <div className="version-history-tabs"><span>版本</span></div>
            <div className="version-history-list">
              {versionHistoryLoading ? <p role="status">正在读取历史版本…</p> : projectVersions.map((version) => (
                <article className={`history-version-card ${version.version === result?.version ? "is-current" : ""}`} key={version.version}>
                  <div className="history-version-icon" aria-hidden="true">v{version.version}</div>
                  <div className="history-version-content"><h3>{version.summary || version.name}</h3><time>{new Date(version.created_at).toLocaleString("zh-CN")}</time><footer><span>v{version.version}</span>{version.version === result?.version ? <small>当前版本</small> : <button aria-label={`恢复到版本 v${version.version}`} disabled={running || restoringVersion !== null} onClick={() => void restoreVersion(version.version)} type="button">{restoringVersion === version.version ? "恢复中…" : "↶ 恢复"}</button>}</footer></div>
                </article>
              ))}
              {versionHistoryError ? <p className="version-history-error" role="alert">{versionHistoryError}</p> : null}
              <p className="version-history-note">恢复会将旧代码保存为新版本，保留全部对话和历史版本。</p>
            </div>
          </section>
        </div>
      ) : null}
      {notice ? <div className="workspace-toast" role="status">{notice}</div> : null}
    </main>
  );
}
