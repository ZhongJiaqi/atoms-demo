# Atoms Demo：自然语言生成应用与交互预览

一个参考 Atoms 首页和工作区交互的非商业演示项目：用户用自然语言描述需求，AI 生成 React 应用，在受控沙盒中构建后提供真实 iframe 预览；后续对话继续修改同一个项目。

本项目使用 Codex 开发。前期使用 **REA（reverse-engineer-anything）** 调研有权限访问的 Atoms 页面，提取视觉布局与交互规格。REA 是开发调研工具，不是线上运行依赖，也不代表获取了 Atoms 的内部源码。

[在线体验](https://atoms-demo-jiaqi.vercel.app) · [界面规格](docs/UI_SPEC.md) · [交互规格](docs/INTERACTION_SPEC.md)

## 已实现的功能

- 邮箱密码注册、邮件确认、登录和退出，使用 Supabase Auth。
- 自然语言生成应用、SSE 实时进度、构建失败自动修复（最多两轮）。
- 同一项目多轮修改、Preview / Code 切换和可交互 iframe 预览。
- 项目、聊天、源码和成功版本持久化，历史项目恢复与版本回滚；回滚保存为新版本，不删除历史。
- 按用户隔离数据；首页按项目展示统一 UI 封面，不自动启动截图任务。

定位是少量真实用户的 Demo，不是完整商业平台。分享、应用发布和 Google 一键登录尚未上线。

## 技术架构

| 层级 | 技术 | 职责 |
| --- | --- | --- |
| 宿主网站 | Next.js 15、React 19、TypeScript、Tailwind CSS 4 | 首页、认证、聊天工作区、代码查看及 iframe 容器 |
| Coding Agent | Node.js、OpenAI SDK、OpenAI-compatible API | 生成源码、增量修改、文件校验和日志修复；当前对接 DashScope，模型由环境变量配置 |
| 生成应用 | React + TypeScript + Vite 6 | 使用固定模板和受控依赖，模型不能任意安装包或执行命令 |
| 认证与存储 | Supabase Auth、Postgres / RLS、私有 Storage | 用户会话、项目/消息/源码/版本/执行记录及成功构建产物 |
| 构建隔离 | 本地 macOS `sandbox-exec`；线上 Vercel Sandbox | 限制文件访问、联网、资源和执行时间，运行类型检查及构建 |
| 线上预览 | 项目独立 Origin、签名授权、Next.js 网关、sandboxed iframe | 读取私有静态产物，隔离宿主与生成应用 |
| 开发与验收 | Codex、REA、Playwright | 协作开发、参考页面调研和浏览器端到端验证 |

线上生成流程：

```text
浏览器输入需求
  → Next.js API：验证用户与项目权限，SSE 返回进度
  → Coding Agent：真实模型调用 → 生成/修改 React + Vite 源码
  → Vercel Sandbox：隔离构建 → 失败时最多两轮修复
  → Supabase：私有 Storage 保存产物，Postgres 保存成功快照
  → 预览网关：校验签名，在项目独立 Origin 返回应用
  → iframe：展示可交互页面
```

多轮修改读取原项目文件，始终使用同一个 `projectId`。云端保存通过项目租约、版本检查和事务化快照，防止旧任务覆盖新结果。

Vercel Sandbox 只负责短时构建，不是长期预览服务器或永久存储。当前线上方案是“私有产物 + Next.js 网关 + 项目独立域名别名”，**不是每轮为生成应用创建一个独立 Vercel Deployment**。进入工作区会自动恢复预览；运行环境或授权过期不等于项目丢失。

生成应用自身的任务、习惯等业务数据主要使用其独立 Origin 的 `localStorage`：刷新可保留，但不保证跨设备同步。它与宿主保存的聊天、源码和版本是两层不同的数据。

## 怎么在本地运行

### 1. 安装依赖

完整本地生成流程目前要求 **macOS**（使用 `sandbox-exec`）；建议 Node.js 24，与线上一致。Windows / Linux 的完整本地沙盒尚未适配。

```bash
git clone https://github.com/ZhongJiaqi/atoms-demo.git
cd atoms-demo
npm ci
cp -n .env.example .env.local
```

`cp -n` 只创建缺失的文件，不覆盖已有配置。用编辑器填写本项目的 `.env.local`：

| 变量 | 填写内容 |
| --- | --- |
| `LLM_API_KEY` | 模型服务 API Key，仅服务端使用 |
| `LLM_BASE_URL` | 模型服务的 OpenAI-compatible Base URL |
| `LLM_MODEL` | 账号实际可调用的模型名称 |
| `NEXT_PUBLIC_SUPABASE_URL` | 本项目 Supabase Project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | 同一项目 Publishable key，不是 `service_role` / Secret key |
| `APP_PUBLIC_ORIGIN` | 本地填写 `http://127.0.0.1:3010` |

不读取其他项目的环境文件，不提交密钥。本地 macOS 沙盒不需要 Vercel 云端凭据；`PREVIEW_PUBLIC_ORIGIN` 可留空，默认使用项目独立的 `.localhost` 子域预览。

环境模板保留了部分早期云端字段。本地只需填写上表配置，并把模板中的 `APP_PUBLIC_ORIGIN` 从 3000 改为 3010；不要手动设置 `VERCEL=1`，也不要为了本地启动复制生产 Vercel Token。

### 2. 准备数据库与认证

已有且已应用本仓库迁移的 Atoms 数据库不用重复初始化。首次自建环境时创建**独立 Supabase Project**，再使用 CLI：

```bash
npx supabase login
npx supabase link --project-ref <你的项目Ref>
npx supabase db push --dry-run
npx supabase db push
```

先核对目标 Project 和 dry-run 迁移清单，再执行最后一条；不要应用到其他业务项目。迁移包含本项目表结构、RLS、版本快照和产物存储配置。

在 Supabase **Authentication → URL Configuration** 中允许 `http://127.0.0.1:3010/**`。纯本地新项目可把 Site URL 设为本地地址；复用已上线项目时，保留线上 Site URL，只添加本地 Redirect URL。

保持邮箱确认开启。普通新邮箱注册需要自定义 SMTP；SMTP 凭据保存在 Supabase Auth，不需要写入 Next.js 环境文件。本演示站使用 QQ SMTP，已用非团队成员的新 Gmail 完成真实收信、确认与登录，但不保证所有邮箱长期投递稳定。[邮件验收报告](docs/EMAIL_SETUP.html)

自建项目的发信配置步骤：

1. 从邮件服务商获取 SMTP 主机、端口、用户名、专用密码或授权码，以及允许使用的发件地址。
2. 进入 Supabase Dashboard 的 **Authentication → 邮件 / SMTP 设置**，开启自定义 SMTP，填写上述字段及发件人名称（例如 Atoms Demo）。不要关闭邮箱确认。
3. 如果使用 QQ 邮箱：先在 QQ 邮箱设置中开启 SMTP 并生成授权码；主机填 `smtp.qq.com`，端口填 `465`，用户名和发件地址都填完整 QQ 邮箱，密码填授权码，**不是 QQ 登录密码**。
4. 保存后，用一个非 Supabase 团队成员的新邮箱实际注册、收信、点击确认并登录。接口接受请求不等于邮件已经到达，也不能用管理员确认代替收信测试。

其他 SMTP 服务商使用自己的参数；不要把授权码贴进聊天、README 或 Git。[Supabase 官方 SMTP 配置说明](https://supabase.com/docs/guides/auth/auth-smtp)

### 3. 启动与体验

```bash
npm run dev -- --hostname 127.0.0.1 --port 3010
```

打开 `http://127.0.0.1:3010`，注册、确认邮箱并登录。在首页输入“创建 Todo App”，成功后继续发送“增加深色模式”“增加任务优先级”，体验同一个项目的连续修改；点击“我的项目”恢复已有应用。

### 4. 按需验证

```bash
npm run typecheck
npm run build
```

浏览器测试使用 Playwright，首次安装浏览器：`npx playwright install chromium`。开发中优先运行受影响的 spec，例如：

```bash
ATOMS_E2E_BASE_URL=http://127.0.0.1:3010 HEADLESS=true npx playwright test tests/e2e/brand-home-navigation.spec.ts
```

真实模型、数据库和多账号测试需要专用账号及对应 `E2E_*` 配置，会消耗模型/沙盒额度。缺少配置导致跳过不代表通过；不要每次文案或样式修改后都运行全量套件。

## 未完成 / 后续优化

| 优先级 | 事项 | 当前边界与下一步 |
| --- | --- | --- |
| P0 | 云端失败任务持久化 | 成功快照已保存；失败消息、执行事件及修复次数仍需完整落库，失败不推进成功版本 |
| P0 | 一致性读取 | 写入已有租约/版本防护；多表读取还需统一快照，减少并发修改时读到混合状态 |
| P0 | 公开演示与额度保护 | 完善应用级滥用防护、配额监控、超时和费用提示；免费层不是无限资源 |
| P1 | 孤儿产物回收 | 定向回收失败/中断任务遗留产物，避免误删成功版本或用户数据 |
| P1 | 邮件投递可靠性 | 继续验证不同邮箱、限流和风控；长期开放注册再评估专用发信服务 |
| P1 | 大陆网络与设备体验 | 不同运营商、真实手机、浏览器缩放和长对话；视口测试不等于真机网络验收 |
| 暂缓 | Google 一键登录 | 未上线；填写 Gmail 注册仍是邮箱密码流程，不是 Google OAuth |
| 暂缓 | 分享与应用发布 | 工作区预览不等同于生成应用的独立公开发布 |
| 暂不扩展 | 生成应用的云端业务数据库 | 目前主要使用 `localStorage`，不承诺跨设备、多用户业务数据同步 |

统一 UI 封面是当前确定方案，不是待修复的截图功能。截图后端与旧缓存保留，但首页不自动调用。[统一封面验收报告](docs/UI_COVER_REPORT.html)

## 代码入口

- `app/`：首页、认证、工作区和生成/恢复/预览 API。
- `lib/agent/`：模型调用、文件校验、创建/修改与自动修复。
- `lib/sandbox/`：本地与云端受控构建；`lib/cloud/`：产物、租约及签名预览。
- `lib/persistence/`、`supabase/migrations/`：项目存储、版本恢复与数据库迁移。
- `sandbox-template/`：固定 React + Vite 模板；`generated-projects/` 是被 Git 忽略的本地目录，不是线上永久存储。
- `tests/`：单元与 Playwright 测试；`HANDOFF.md`：最新进度和历史运维记录。

仓库不包含模型、SMTP、Supabase 管理或 Vercel 密钥。历史调研文档中的观察、推测和实现建议，不应被当作当前产品已实现的功能。
