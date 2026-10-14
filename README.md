# Atoms Demo：核心 Coding Agent

本项目使用 Codex 开发。

当前版本已经跑通创建与多轮修改流程：用户第一次输入自然语言后，服务端调用真实 DashScope OpenAI-compatible 模型生成 React + Vite 源码；后续输入会携带同一个 `projectId`，读取原文件并让模型只返回必要的增量补丁。每一轮都在受控 macOS 沙盒中重新完成 TypeScript 检查和 Vite 构建，通过 SSE 返回执行状态，并用同一个项目 ID 更新真实 iframe 预览。构建失败时，Agent 会把真实日志交给模型自动修复，最多两轮；仍失败则恢复上一成功版本。

## 目录

- `app/api/generate/`：返回 SSE 的完整生成流程入口。
- `app/api/preview/`：把受控 Vite 服务代理成前端可加载的真实预览 URL。
- `lib/agent/`：真实模型调用、文件合同、自动修复和状态机。
- `lib/sandbox/`：macOS `sandbox-exec`、资源监控、超时和预览生命周期。
- `generated-projects/`：每项目独立的 0700 目录，保存当前源码、消息、执行历史、分轮日志和版本快照；已加入 `.gitignore`。
- `sandbox-template/`：预先写好的 React + Vite 示例。
- `docs/TECHNICAL_FEASIBILITY.md`：逐项测试结果、限制和下一步。

## 本地运行

安装依赖：

```bash
npm install
```

先填写本项目自己的 `.env.local`。可以参考 `ai-news-radar`，但运行时不会读取其他项目的环境文件。完整人工配置步骤见 `docs/ONLINE_LAUNCH_CHECKLIST.html`。

启动宿主：

```bash
npm run dev -- --hostname 127.0.0.1
```

然后访问 `http://127.0.0.1:3000`。

打开 `http://127.0.0.1:3000`，注册或登录后，在左侧输入需求并点击“生成应用”。生成 API 现在要求真实 Supabase 会话，不能再用匿名 `curl` 冒充浏览器验收。

主要事件依次为 `accepted`、`model_started`、`model_completed`、`files_saved`、`build_started`、`preview_started`、`complete`。失败构建会额外返回 `build_failed`、`repair_started` 和 `repair_completed`。

首次创建成功后，从 `complete` 事件取得 `projectId`。后续修改必须继续发送该 ID：

```bash
curl -N \
  -H 'Content-Type: application/json' \
  --data '{"projectId":"首次返回的 UUID","requirement":"增加深色模式"}' \
  http://127.0.0.1:3000/api/generate
```

修改轮次会额外返回 `project_loaded`。每个项目的 `project-state.json` 保存历史消息、执行事件和当前版本；`.atoms/versions/` 保存成功版本源码，`.atoms/runs/` 保存每轮构建日志。

## 沙盒限制

- 模型只能写入允许清单内的 `src/App.tsx`、`src/styles.css`、受控组件和数据文件。
- `package.json`、入口、Vite 配置和依赖版本由平台固定，模型不能运行任意命令或安装依赖。
- 每个项目使用独立 0700 目录，生成文件、状态和历史记录为 0600。
- 构建沙盒禁止外网，并显式拒绝读取模型凭证、SSH、AWS、Codex 等敏感目录。
- 写入范围限制为当前任务目录；CPU、内存、进程数、文件大小、文件描述符和墙钟时间均有限制。
- 预览最多运行 15 分钟；只有独立预览 Origin 才允许 iframe 使用 `allow-same-origin`，同源回退继续保持严格隔离。

本地实现使用 macOS `sandbox-exec`。Vercel Function 不能承载持续 Vite 进程；正式线上部署将使用 Vercel Sandbox 完成短时构建，并把成功的 `dist` 发布为独立静态 Deployment。当前远程适配尚未完成，不能把本机进程方案冒充生产隔离。

## 校验命令

```bash
npm run typecheck
npm run build
```

`.env.local` 已加入 `.gitignore`。提交仓库前仍应执行密钥扫描，且不得提交任何模型、Supabase 管理或 Vercel Token。
