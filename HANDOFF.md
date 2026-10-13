# Atoms Demo 项目交接文档

更新时间：2026-10-14（Asia/Shanghai）

## 当前结论

Phase 2 的本地代码骨架已经完成：邮箱认证、用户会话、项目数据库持久化、历史项目、项目恢复、RLS 数据隔离和真实 E2E 验收脚本均已接入现有 Coding Agent，没有重写模型生成、两轮自动修复、SSE 或本地 Sandbox 核心链路。

当前还不能宣称“线上可用”：

1. 本项目自己的 `.env.local` 已创建；2026-10-14 仅检查配置是否存在，模型 API、独立 Supabase URL 和 Publishable key 均已填写，未输出任何密钥。
2. 独立 Supabase 项目和迁移已经完成；用户已成功收信、注册登录和生成应用。两个自动化测试账号尚未配置，完整跨账号与冷启动恢复验收仍未完成。
3. 线上 Sandbox 尚未实现。现有 `lib/sandbox/local-sandbox.ts` 依赖 macOS `sandbox-exec`、本机目录和长期 Vite 进程，不能直接部署到 Vercel Function。

项目目录：`/Users/jiaqizhong/atoms-demo`

当前目录已初始化独立 Git 仓库（main）。阶段提交以 `git log` 为准，尚未推送 GitHub。GitHub CLI 上次检查 Token 失效，线上关联时需重新核对。

## 用户确认的边界

- 线上公开演示，预计 1–2 位真实用户，非商业，中国大陆访问，优先免费方案。
- 可以复用已有服务账号，但 Atoms 必须使用自己的 `.env.local` 和独立 Supabase Project。
- 只参考 `ai-news-radar`，不再扫描其他项目。
- Atoms 必须新建自己的业务表结构，禁止读取或复用 `ai-news-radar` 的业务表和数据。
- 能用 CLI 自动完成的工作优先使用 CLI；需要网页授权或敏感输入时再让用户操作。
- 模型仍使用此前验证过的 DashScope OpenAI-compatible API，不改变模型调用策略。
- 2026-10-14 用户要求先补历史项目中的 v1，分享和发布暂缓。先补版本展示，随后按追加要求实现真实回滚。
- 随后用户要求真实回滚，并要求首页“我的项目”放在对话输入框下方。已按此实现；恢复旧源码采用新版本快照，保留全部已有版本。分享/发布继续暂缓。

## 已完成的实现

### 认证

- 新增 `@supabase/ssr` 与 `@supabase/supabase-js`。
- 新增浏览器端和服务端 Supabase client。
- 新增 `middleware.ts`，刷新 Cookie 会话并保护 `/?project=...` 和 `/projects`。
- 新增 `/login` 邮箱注册/登录页面、`/auth/callback` 和 `/auth/logout`。
- 登录成功只接受站内 `next` 路径，防止开放重定向。
- 未配置 Supabase 时公开首页仍可打开；访问受保护项目会明确提示配置缺失。
- 业务代码不读取 `SUPABASE_SERVICE_ROLE_KEY`，服务端也不接受前端传入的 `user_id`。

### Atoms 专用数据库结构

迁移文件：`supabase/migrations/202610130001_phase2_persistence.sql`

迁移新建：

- `projects`
- `messages`
- `project_files`
- `project_versions`
- `agent_runs`
- `save_project_version(...)` 原子保存函数

五张表都启用 RLS，并通过 `owner_id = auth.uid()` 隔离。迁移只给 Atoms 自己的两个 identity sequence 授权，不能使用 `all sequences in schema public`，避免影响共用实例中的其他项目。

已通过 Supabase CLI 创建独立免费项目 `atoms-demo`（ref：`jvnweimexkigooqvagfz`，Singapore），并应用迁移。远端只读验证结果：5 张目标表、5 个 RLS policy、1 个保存 RPC。该项目拥有独立 Postgres、Auth、URL、Key 和迁移历史；ai-news-radar 没有收到写入或配置变更。

### Agent 自动保存与项目恢复

- 首次生成先创建稳定的数据库项目草稿。
- 创建或修改成功后，把项目、消息、完整源码、Agent 事件和版本原子保存。
- 数据库保存成功后才发送 SSE `complete`；失败会返回真实错误。
- 修改前通过 Supabase 会话和 RLS 验证项目访问权限。
- `GET /api/projects` 按 `updated_at` 倒序读取当前用户项目。
- `POST /api/projects/[projectId]/resume` 从数据库读取消息和源码；本地 Sandbox 已销毁时重新装载、构建并启动预览。
- 工作区可通过 `/?project=<uuid>` 恢复同一项目，继续对话不创建新项目。
- 页面已增加历史项目入口、登录/注册/退出以及保存中/已保存/保存失败状态。

### 项目专用环境文件

- 已创建 `/Users/jiaqizhong/atoms-demo/.env.local`。
- 已在 `.gitignore` 中忽略 `.env`、`.env.local`、`.env.*.local`。
- README 和 E2E 文档已删除运行时读取 `ai-news-radar/.env.local` 的命令。
- `.env.local` 已填写独立 Supabase URL、Publishable key 和模型配置。允许从 ai-news-radar 复制的只有：
  - `LLM_API_KEY` → 同名。
  - `LLM_BASE_URL` → 同名。
  - `LLM_MODEL` 保持 `qwen3.8-flash`。
- 新项目的 Publishable key 已填入 `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`。
- 禁止从 ai-news-radar 复制任何 Supabase URL/Key，也禁止复制 `SUPABASE_SERVICE_ROLE_KEY`、`CRON_SECRET` 和 `LARK_WEBHOOK_URL`。

完整逐步操作说明：`docs/ONLINE_LAUNCH_CHECKLIST.html`。

2026-10-14 最新只读状态检查：`docs/PROJECT_STATUS.html`。远端聚合查询确认 1 个已确认用户、2 个项目（1 个成功项目和 1 个无成功版本草稿）、2 条消息、2 个代码文件、1 个版本、1 个成功任务、0 个失败任务。成功生成确实有数据库记录；这些计数不替代跨账号隔离与冷启动恢复验收。用户最新报告构建成功，前述“需重试原需求”已由用户实测补充。

## 已固化的测试

单元与契约测试：

- `tests/auth/auth-boundaries.test.ts`
- `tests/persistence/project-store.test.ts`
- `tests/persistence/sandbox-restore.test.ts`
- `tests/persistence/schema.test.mjs`

Playwright：

- `tests/e2e/phase2-auth-persistence.spec.ts`：真实注册、Todo 创建、深色模式、刷新、退出重登、历史恢复、第二账号隔离、继续增加优先级。
- `tests/e2e/representative-apps.spec.ts`：任务管理、个人记账、习惯打卡；已加入真实登录前置。

两套 E2E 都要求真实模型与真实数据库，不提供 Mock 通过路径。

## 当前验证结果

### 2026-10-14：版本回滚与首页项目区域

- 工作区“历史记录”改为当前项目的独立右侧版本面板，显示版本摘要、时间、当前标记与真实恢复按钮；版本卡按钮可打开此面板。使用版本标识占位，不冒充已经保存的预览截图，克隆暂未实现。
- 新增 `POST /api/projects/[projectId]/restore`。验证登录/所有权/期望版本；从 Supabase 的不可变版本源码创建独立运行目录，真实构建/启动成功后使用原保存 RPC 创建新版本，再切换预览。例如 v2 恢复 v1 后保存为 v3，继续修改得到 v4。
- 源码、消息、任务和版本指针一起保存；修改基线使用已激活的运行目录，预览过期后仍记住本实例的源码目录；跨进程重启仍通过数据库恢复。
- 保存响应丢失时用 turn UUID 查询数据库确认是否提交；最终 events 在保存前同步到运行目录。配置 URL 在提交前校验。待激活进程已退出时返回 `previewReady:false`，客户端自动通过 resume 重建已提交版本，不把死进程注册为预览。
- 失败 stage 与旧 restore 临时目录/映射会清理；只清理本功能创建且经同项目 UUID/父目录验证的运行目录，不删除真实数据库历史或原 canonical 项目目录。
- 首页需求框下方新增“我的项目”网格。登录后自动真实查询自己的项目；提供加载/空/错误状态、卡片进入工作区；未登录显示登录引导。
- 真实 E2E 自动创建两个临时测试账号（测试 Node 使用 CLI 取得本项目管理凭据，不发送到浏览器、不写 env），以真实用户 RLS 保存两份明确测试源码；恢复与一轮后续修改分别走真实沙盒和真实模型。最后清理本用例账号、项目和运行目录，原真实用户不变。
- 回滚单元测试覆盖保存失败、期望版本冲突、提交响应丢失确认、最终事件同步。沙盒浏览器测试覆盖子进程退出后拒绝激活。
- 最后一次回归前曾出现 Playwright APIRequestContext 的 ECONNRESET（服务 health 仍为 200）；重复恢复验收改为真实 UI 点击，不使用底层 API 连接池或盲目重试非幂等 POST。最终结果见下方更新与测试报告。
- 最终验证：生产构建、typecheck、26/26 单元测试通过；7/7 Playwright 回归通过（含真实数据库回滚、真实沙盒、真实模型继续修改、刷新、第二账号拒绝、重复回滚目录回收、首页项目卡片）。操作页无非预期 console error/4xx/5xx；无效登录 400、冲突 409、无权访问 404 是专门验证的预期拒绝。局部独立复审无剩余 Critical/Important。当前服务 `http://127.0.0.1:3010`。
- 测试结束清理了测试新建的账号、项目及运行目录；你的已有真实账户、项目及全部历史保留。测试 screenshots/trace 仅本地保存，报告不要公开上传。

2026-10-14 版本历史展示修复：数据库只读确认 1 个项目同时有 v1/v2，原列表 API 仅返回项目当前版本导致 v1 不显示。`listUserProjects` 已嵌入查询 `project_versions`（版本号、名称、摘要、时间，不读取历史源码），各项目下版本倒序排列，界面显示摘要、时间和当前版本标记。无需新迁移，无数据库写入。单测与 UI 回归均先失败后通过；21 单测、构建、typecheck、3 个导航/版本 UI Playwright 通过，局部审查通过。版本 UI 用例使用 API 契约样本，仅验证显示，不能冒称真实登录/RLS 端到端验收。服务已在 3010 重启。

2026-10-14 `src/types.ts` 构建拒绝修复：用户报告已收到确认邮件并成功注册登录（用户观察，未替代自动化完整认证验收）。模型生成独立类型文件时被 SOURCE_PATH 白名单拒绝，现仅新增允许 `src/types.ts`，原路径越界、依赖、大小及执行限制保持。读取、恢复、增量修改和删除共用白名单；完整源码重写时清理旧类型文件，避免成功版本不含它而磁盘仍残留。新增 `tests/agent/source-paths.test.ts`，先复现白名单和陈旧文件问题再修复，20 单测通过。新增 `tests/e2e/types-file-sandbox.spec.ts`，明确使用回归测试源码而非 AI 生成结果，真实 sandbox-exec 构建 + iframe 按钮交互通过，0 console error、0 4xx/5xx。生产构建和 typecheck 通过，服务已在 3010 重启。本轮未调用模型重跑用户原需求，需用户刷新后重试。

2026-10-14 注册页配置缺失修复：`.env.local` 实际已填写，但 `supabaseConfig()` 传入整个 `process.env`，Next.js 未将公开变量内联到浏览器，导致登录/注册报“缺少 NEXT_PUBLIC_SUPABASE_URL”。已改为逐项直接引用两个 `process.env.NEXT_PUBLIC_*`，未修改环境文件。新增 `auth-browser-config.spec.ts`，修改前在真实浏览器复现缺配置且未发送请求，修改后真实 Supabase token POST 返回预期 `invalid_credentials`（无效账号验证，不创建用户、不发送邮件、无 Mock）。该测试和桌面/窄屏导航合计 3 项通过；18 单测、构建、类型检查通过，局部独立审查通过。完整邮件注册成功仍依赖 SMTP，不能将此回归测试称为完整注册验收。

```text
npm run build                 通过
npm run typecheck             通过
 npm run test:unit            通过（26/26，2026-10-14）
 回滚/认证/导航/沙盒回归        通过（7/7 Playwright，真实 DB/模型/沙盒）
npx playwright test --list    通过（9 个 E2E，2026-10-14）
auth-navigation.spec.ts      通过（桌面/窄屏 2 项；桌面检查 0 console error，0 4xx/5xx）
```

尚未执行：

- 完整 Phase2 邮件注册 → 首次真实模型 Todo 生成 → 两轮修改 → 真正销毁旧宿主后恢复的整套原始 E2E；本轮已验证独立回滚用例的真实 JWT 写入、跨账号恢复拒绝与后续真实模型修改，不能等同于所有原始用例都通过。
- 线上 Vercel Sandbox 与静态 Preview。
- 中国大陆不同运营商网络实测。

## CLI 当前状态

- Supabase CLI 2.90.0 已登录。
- 已尝试在旧项目 dry-run；CLI 因旧项目 001–007 迁移历史与 Atoms 不一致而安全拒绝，未执行任何 SQL，也未 repair 旧历史。
- 随后通过 CLI 新建独立免费项目 `atoms-demo`，随机数据库密码已保存到本机 macOS Keychain 条目 `atoms-demo-supabase-db`。
- Atoms 目录已经 link 到新 project ref，`supabase db push --dry-run` 仅显示 Atoms 迁移，正式 `supabase db push --yes` 已成功。
- 远端 schema 验证已通过；下一步是用真实用户 JWT 验证 RLS。
- GitHub CLI 账号存在，但 Token 失效；需 `gh auth login -h github.com`。
- Vercel CLI 已安装但没有可用登录会话；之后需 `vercel login`、`vercel link`。
- `atoms-demo` 已初始化独立 main 仓库；没有进行外部推送。

## 下一步人工操作

基础环境配置已填写。下一步准备两个真实测试用户并填写测试环境变量。用户已收到确认邮件，SMTP 不再视为当前体验的已证实阻塞；仍需核对生产邮件配置、限制和第二个真实邮箱的收信能力。

如果 CLI 无法完成 Auth 控制台设置，才按下面方式操作：

1. `Authentication → Providers → Email` 启用邮箱密码。
2. 用户明确要求保留 `Confirm email` 开启。公开注册上线前必须配置自定义 SMTP；不得关闭确认绕过邮件配置。
3. `Authentication → URL Configuration` 先把 Site URL 设为 `http://localhost:3000`。
4. Redirect URLs 加入 `http://localhost:3000/**`。
5. 创建两个不同邮箱的已确认用户，并把账号密码只写入 Atoms `.env.local` 的 `E2E_PRIMARY_*` 和 `E2E_OTHER_*`。

## 线上架构与仍需实现

2026-10-14 只读代码复审发现的未解决项（不得以现有单元测试通过代替这些验收）：

- 失败任务目前只保存本地 JSON；需要把失败消息、执行事件、错误和修复次数保存到数据库，且不推进成功版本。
- 项目恢复通过四个独立读取请求取得元数据、消息、源码和 runs；需统一快照读取，避免并发修改时拼出不同版本。
- 当前 authenticated 角色可直接写业务表；需评估把状态机写入收口到验证身份及版本的 RPC。
- 本地预览 API 未验证项目访问权；预览使用独立 Origin，不能简单依赖宿主 Cookie，需签名预览访问机制。
- 生成锁是单实例全局锁，线上需项目级数据库租约。
- 真实冷启动测试尚未销毁原 Sandbox/进程/目录；必须补测后才能宣称恢复成功。
- 登录返回地址的反斜杠/控制字符问题已通过先失败后通过的回归测试修复。
- 首页已按新要求在输入框下方直接展示真实历史项目卡片；原浮层仍可查看项目/版本。已登录真实历史读取由回滚 E2E 覆盖，完整 Phase2 原始用例仍待验收。
- 旧 Next.js 15.3.9 开发进程与新版生产构建共用 `.next`，导致验证时 500；已确认进程属于本项目并停止，再构建通过。当前新版验证服务为 `http://127.0.0.1:3010`。不要同时在同目录运行 dev 与 production build/start。

推荐：

```text
Vercel Hobby：Next.js 宿主
Supabase Free：Auth + Postgres + RLS
DashScope：真实模型
Vercel Sandbox：短时隔离构建
独立 Vercel Preview Project：每个成功版本的静态 Deployment
```

代码待办：

1. 新增 Vercel Sandbox adapter，保持现有 Sandbox 接口不变。
2. 限制 CPU、内存、执行时间、进程和网络，任务结束立即 stop。
3. 发布 `dist` 到独立 Preview Project。
4. 将 Deployment URL 与项目版本一起保存。
5. Deployment 失效时从 `project_files` 恢复并重建。
6. 远程生成锁不能继续依赖单进程内存，需要数据库锁或任务状态 CAS。
7. 完成线上 Playwright、0 console error、0 非预期 4xx/5xx 与大陆网络实测。

## 风险

- 公开注册会允许任意用户消耗模型额度；广泛公开前应增加最小的服务端生成频率限制。
- Supabase Free 低活动项目可能暂停；演示前应登录并唤醒。
- Vercel 官方不保证中国大陆访问，必须真机实测。
- Vercel Hobby 旧 Deployment 保留数量有限，数据库源码和版本快照才是恢复来源。
- 用户批准将 Next.js 从 15.3.9 升级到 15.5.27 并更新锁文件，已执行。2026-10-14 审计剩余 3 项（0 critical、2 high、1 moderate），涉及 PostCSS 和 sharp；npm 建议的完整修复包含 Next.js 16 大版本升级，不得直接运行 `npm audit fix --force`。
- 用户要求的 `~/Documents/Codex-prompt-template.md` 不存在，因此本轮未修改 Agent Prompt。

## 新会话启动指令

先完整阅读本文件和 `docs/ONLINE_LAUNCH_CHECKLIST.html`。

- Supabase 项目、link、迁移与 schema 验证已经完成，不要重复创建或操作 ai-news-radar 项目。
- 如果环境与迁移已完成：启动 Atoms Demo，运行 `npm run test:e2e:phase2`，根据真实失败日志修复，直到认证、数据库、恢复和跨账号隔离通过。
- 本地 Phase 2 通过后，再实现 Vercel Sandbox + 静态 Preview。

禁止重写现有 Agent 核心链路，禁止复用 ai-news-radar 的业务表，禁止在前端或生成应用中暴露高权限密钥，禁止把未运行的真实 E2E 写成通过。
