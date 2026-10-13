# Atoms Demo 上线部署与沙盒基础设施调研

> 2026-10-13 决策更新：用户已确认本月为 1–2 位中国大陆用户的非商业演示，并接受 Vercel 无大陆 SLA 的风险、优先零固定成本。当前首选方案已改为“受约束的纯前端生成 + 浏览器隔离预览”，Cloudflare 付费容器只作为需要任意依赖、真实 Node/Vite 运行或生成后端时的升级方案。详见 [中国大陆一个月零固定成本部署方案](./CHINA_ONE_MONTH_DEPLOYMENT.md)。下文保留为完整生产沙盒方案的技术调研记录。

更新时间：2026-10-13（Asia/Shanghai）

## 1. 结论先行

当前 PoC 已证明“Next.js 宿主 → 真实模型 → Vite 进程 → iframe”的基本链路，但距离用户可在线使用仍缺少四块生产能力：

1. **真正的线上沙盒**：本机 `sandbox-exec` 不能承担用户生成代码。建议新项目直接采用 Cloudflare Sandboxes 当前 1.0 架构，即 Worker + Durable Object + Container，而不是已进入维护期的 Sandbox SDK 0.x。
2. **用户、项目与版本持久化**：建议用 Supabase Auth + Postgres + Storage；Cloudflare 容器和快照不能作为唯一数据源。
3. **线上宿主与域名**：建议 Next.js 部署到 Vercel，Cloudflare Worker/Container 独立部署，预览使用专用域名并与主站隔离。
4. **生产凭证与付费账户**：当前模型凭证来自本机另一个项目的 `.env.local`，线上无法访问；Cloudflare Sandboxes 只在 Workers Paid 计划可用。

推荐的 MVP 拓扑：

```text
浏览器
  ├─ https://app.example.com                 Next.js / Vercel
  │    ├─ Supabase Auth（登录）
  │    ├─ Supabase Postgres（项目、消息、版本、任务）
  │    ├─ Supabase Storage（版本代码包/产物）
  │    ├─ DashScope OpenAI-compatible API（仅服务端调用）
  │    └─ 服务端调用 Cloudflare Worker 控制面
  │
  └─ iframe: https://<preview-id>.example-previews.com
       └─ Cloudflare Worker → Durable Object → 独立 Container
            └─ Vite 预览服务（0.0.0.0:固定端口）
```

这是架构建议，不代表当前仓库已经实现这些线上模块。

## 2. 当前状态与明确阻塞

### 2.1 已验证

- Next.js 15.3.9 可启动并完成生产构建。
- 通过 OpenAI SDK 调用 DashScope OpenAI-compatible API 可得到真实响应。
- 固定 Vite 示例可以在本机受控进程运行，并能被跨 Origin iframe 加载。
- 模型密钥没有写入当前项目源码。

来源：仓库内 [技术可行性报告](./TECHNICAL_FEASIBILITY.md)。

### 2.2 当前机器阻塞

| 项目 | 当前观察 | 影响 | 用户需要做什么 |
| --- | --- | --- | --- |
| Docker 兼容运行时 | 未发现 Docker、Colima 或 Podman | 无法在本机运行/调试 Cloudflare Container；若 Wrangler 从 Dockerfile 发布，也无法本机构建镜像 | 安装并启动 Docker Desktop 或 Colima，确保 `docker info` 成功 |
| Wrangler | 未发现全局命令 | 尚不能本地启动或发布 Worker + Container | 推荐作为项目 devDependency 安装，不要求全局安装 |
| GitHub CLI | `ZhongJiaqi` 当前 token 无效 | 无法可靠创建远端、推送、触发 Git 部署 | 执行 `gh auth login -h github.com` 重新授权 |
| 模型生产密钥 | 仅在 `/Users/jiaqizhong/ai-news-radar/.env.local` | Vercel/Cloudflare 无法读取本机绝对路径 | 提供可部署到托管平台 Secret 的 `LLM_BASE_URL`、`LLM_API_KEY`、`LLM_MODEL`，最好使用单独的生产 Key |
| Cloudflare 付费能力 | 尚未确认账户/账单 | Sandboxes 不在免费计划 | 准备 Cloudflare 账户并开通 Workers Paid |
| 域名 | 尚未确认 | 无法完成长期稳定、安全隔离的预览 Origin | 准备一个主站域名和一个独立预览域名，或明确接受早期仅用测试域名 |

本机 Node.js `v23.9.0` 满足 Next.js 当前文档的最低 Node.js `20.9`，也高于 Wrangler 文档列出的最低版本，因此 Node 本身不是阻塞。[Next.js 安装要求](https://nextjs.org/docs/app/getting-started/installation)；[Cloudflare Sandboxes 入门](https://developers.cloudflare.com/sandbox/get-started/)

## 3. Cloudflare Sandboxes：当前官方状态

### 3.1 产品与版本选择

**官方事实：** Cloudflare Containers 与 Sandboxes 已在 2026-04-13 宣布 GA，可用于运行模型生成或用户提供的不可信代码，但只在 Workers Paid 计划提供。Container 实例是具有独立内核和网络的 microVM，外部 HTTP 只能通过 Worker 到达。[GA 公告](https://developers.cloudflare.com/changelog/post/2026-04-13-containers-sandbox-ga/)；[Sandboxes 概览](https://developers.cloudflare.com/sandbox/)

**官方事实：** Sandbox SDK 1.0 已在 2026-09-30 发布。新架构由开发者自己的 Durable Object 直接控制 Container；0.x 会继续获得问题与安全修复到 2026-12-31。[Sandboxes Changelog](https://developers.cloudflare.com/changelog/product/sandbox/)

**风险：** Sandboxes 产品虽然已公开可用，但 1.0 使用的 Durable Object Container `durable_object` 调度策略仍标为 public beta；Container snapshots 也仍是 public beta。行为和 API 可能变化。[调度策略](https://developers.cloudflare.com/containers/configuration/scheduling-policy/)；[快照说明](https://developers.cloudflare.com/sandbox/files/save-and-restore-a-workspace/)

**结论：** 可以用于可演示、可灰度的线上 MVP，但应把“平台 Beta 变更、快照失败、冷启动”纳入错误处理，不能把快照当作唯一持久化数据。

### 3.2 本地和发布要求

**官方事实：** `wrangler dev` 在本机 Docker 中运行实例，因此必须启动 Docker；当前托管镜像 `cloudflare/debian-trixie` 的本地开发要求 Wrangler `4.141.0+`，Durable Object 调度本地开发至少要求 `4.136.0+`。[Sandboxes 入门](https://developers.cloudflare.com/sandbox/get-started/)；[Containers 本地开发](https://developers.cloudflare.com/containers/guides/local-dev/)

**官方事实：** 如果 Wrangler 配置引用本地 Dockerfile，`wrangler deploy` 需要 Docker 兼容引擎来构建和推送镜像；如果引用已在 Registry 中的镜像，发布时可以不使用本地 Docker。Cloudflare Workers Builds 也可在其构建环境完成 Dockerfile 构建。[部署 Containers](https://developers.cloudflare.com/containers/guides/deploy/)

**本项目建议：**

- 固定项目内 Wrangler 版本为 `4.141.0+`，不要依赖机器上的全局版本。
- 开发者本机安装 Docker Desktop 或 Colima。
- 生产发布使用 GitHub → Cloudflare Workers Builds，并建立独立 staging Worker；官方说明普通非生产分支只上传 Worker 版本，并不会自动得到完整 Container 预览环境。
- Container 镜像以 `linux/amd64` 为目标。[Containers 入门](https://developers.cloudflare.com/containers/get-started/)

### 3.3 预览 URL 与自定义域名

当前 1.0 有两种官方预览方式：

| 方式 | 适用阶段 | 官方限制/特点 |
| --- | --- | --- |
| `https://<worker>.workers.dev/previews/<name>/...` | 初期联调、无域名验证 | Worker 将路径转发到指定 sandbox；前缀会被移除。以 `/` 开头的链接会离开预览，Vite 的绝对资源路径和 HMR 更难处理 |
| `https://<name>.example-previews.com/...` | 线上 iframe，推荐 | 每个预览独立 Origin，路径原样到达容器；需要 Cloudflare 托管该预览域名的 DNS、通配 DNS 和 Worker route |

来源：[Preview a web application](https://developers.cloudflare.com/sandbox/previews/)；[Serve previews on their own hostnames](https://developers.cloudflare.com/sandbox/previews/serve-previews-on-their-own-hostnames/)

**重要安全事实：** Cloudflare 明确要求预览使用不承载主应用的 hostname；预览代码运行在访问者浏览器中，如果使用主应用 hostname，就可接触该 hostname 的应用 Cookie 和 API。每个预览独立 hostname 可隔离不同预览的浏览器存储。[Sandbox security](https://developers.cloudflare.com/sandbox/concepts/security/)；[独立预览 hostname](https://developers.cloudflare.com/sandbox/previews/serve-previews-on-their-own-hostnames/)

**域名建议：**

- 主应用：`app.example.com`，交给 Vercel。
- 预览：最好使用另一注册域，例如 `*.example-previews.com`，其 DNS 交给 Cloudflare。
- 次优方案：`*.previews.example.com`。官方提醒这类更深层 hostname 不在普通 Universal SSL 覆盖范围内，可能需要 Total TLS 或高级证书；同时，设置为 `Domain=example.com` 的主站 Cookie 会被浏览器发送到预览子域。
- 不要把主站 session cookie 发送给预览；预览访问令牌使用预览自身的 host-only cookie 或短期 URL/token。

### 3.4 Vite 预览服务要求

**官方事实：** Container 内服务需要监听 `0.0.0.0`。Vite 会校验 Host，预览 hostname 需要纳入 `server.allowedHosts`。路径前缀式预览不适合使用绝对 `/` 资源路径；独立 hostname 可避免 base path 问题。[Preview a web application](https://developers.cloudflare.com/sandbox/previews/)

**实现推论：** Atoms Demo 线上应使用固定容器端口、`host: "0.0.0.0"`、明确的 hostname 白名单，并优先采用每预览独立 hostname，而不是为每个生成应用调整 Vite `base`。

### 3.5 安全边界

**官方事实：** 一个 sandbox 内所有进程共享同一 Linux 系统、文件与 localhost；部署后的进程拥有相同的 root 能力，不能靠 Linux 用户权限把同一 sandbox 内的进程互相隔离。不同用户必须使用不同 sandbox 身份。[Sandbox security](https://developers.cloudflare.com/sandbox/concepts/security/)

**官方事实：** Container 默认 `enableInternet: false`。若为了 `npm install` 打开任意互联网，恶意依赖也能外传 sandbox 内能读取的数据。官方建议保持互联网关闭，并由 Worker outbound handler 仅放行所需目标；凭证由 Worker 注入请求，而不是交给 sandbox。[Sandbox security](https://developers.cloudflare.com/sandbox/concepts/security/)；[Credentials and network access](https://developers.cloudflare.com/sandbox/network/)

上线前最低安全要求：

- Worker 先认证用户，再从已验证身份和项目 ID 派生 sandbox 名称；不能直接信任客户端提交的 sandbox ID。
- 绝不向 sandbox 注入模型 Key、Supabase Secret、Cloudflare API Token 或主站 Cookie。
- 默认无外网；安装依赖只放行 npm registry，且要有时间、流量、包大小和进程限制。
- 对命令、日志、文件路径和产物大小设置上限；输出按不可信输入处理。
- 任务结束或空闲超时后停止容器；失败时也执行清理。
- iframe 保持受限 `sandbox` 权限；主站 CSP 用 `frame-src` 仅放行预览域，预览响应用 `frame-ancestors` 仅允许主站嵌入。规范依据：[CSP Level 3](https://www.w3.org/TR/CSP/)；[HTML iframe sandbox](https://html.spec.whatwg.org/multipage/iframe-embed-object.html)

### 3.6 生命周期与持久化

**官方事实：** Container 实例停止时，其文件、内存、进程和网络连接都会结束；文件只有在实例继续运行或保存/恢复 snapshot 时才保留。snapshot 只保存可写根文件系统，不保存内存或进程，当前保留期为创建或最近一次恢复后的 30 天。[Sandbox lifetime](https://developers.cloudflare.com/sandbox/concepts/lifetime/)；[Container limits](https://developers.cloudflare.com/containers/platform/limits/)

**结论：** 多轮修改不能只依赖“原容器还活着”。每个成功版本都必须输出一个可持久保存的源代码 artifact；后续会话从 artifact 恢复，然后再启动 Vite。snapshot 可作为性能优化，不是权威版本库。

### 3.7 定价与默认限制

**官方事实：** Sandboxes 的费用来自底层 Containers，且还会计入 Worker、Durable Object 和可选日志费用。Workers Paid 当前为 5 美元/月，包含 25 GiB-hours 内存、375 vCPU-minutes 和 200 GB-hours 磁盘；超额按量计费。Container 只有收到请求或被主动启动后才开始计费，休眠后停止计费。[Sandbox pricing](https://developers.cloudflare.com/sandbox/platform/pricing/)；[Containers pricing](https://developers.cloudflare.com/containers/platform/pricing/)

当前实例规格从 `lite`（1/16 vCPU、256 MiB、2 GB 磁盘）到 `standard-4`（4 vCPU、12 GiB、20 GB 磁盘）。默认账户级上限包括 6 TiB 并发内存、1500 并发 vCPU、30 TB 并发磁盘与 50 GB 镜像存储；均可申请提高。[Container limits](https://developers.cloudflare.com/containers/platform/limits/)

**MVP 推论：** React/Vite 安装与构建很可能需要高于 `lite` 的内存，需用真实依赖集基准测试后选择 `basic` 或 `standard-1`，并通过短空闲超时控制费用。

## 4. Next.js 宿主与 Cloudflare 沙盒分离部署

### 4.1 建议选择 Vercel 托管 Next.js

Next.js 官方说明 Node.js server 和 Docker 支持全部框架功能；Vercel 是当前列出的 verified adapter，而 Cloudflare 的 Next.js adapter 仍属于平台自有集成、兼容性可能有差异。[Next.js 部署方式](https://nextjs.org/docs/app/getting-started/deploying/)

因此建议：

- Next.js 宿主部署到 Vercel。
- Cloudflare 只承担 Worker 控制面、受控 Container 和预览流量。
- 浏览器向 Next.js 同源 API 提交生成/修改请求；Next.js 服务端再携带独立内部凭证调用 Cloudflare Worker。
- 浏览器只获得短期预览 URL，不获得 Cloudflare 控制 API 凭证。

这样浏览器不直接跨域调用控制面，能显著减少 CORS 与密钥暴露面。

### 4.2 跨域与域名条件

- **iframe 加载本身不等同于浏览器 `fetch` CORS。** 主站需要在 CSP `frame-src` 中允许 `https://*.example-previews.com`；预览响应需允许主站作为 `frame-ancestors`。[CSP Level 3](https://www.w3.org/TR/CSP/)
- 如果浏览器要直接 `fetch` Cloudflare Worker，Worker 必须处理 CORS 预检，并只允许明确的主站 Origin；不要用带凭证的 `*`。CORS 行为由 Fetch 标准定义。[Fetch Standard](https://fetch.spec.whatwg.org/)
- 推荐 Next.js 服务端代理所有控制请求，因此控制 Worker 无须向浏览器开放宽泛 CORS。
- iframe 与主站用 `postMessage` 交换“预览就绪、运行错误、尺寸”等最小事件时，双方必须校验准确的 `origin` 和消息 schema。
- Cloudflare 明确建议管理预览的停止、删除等路由放在与预览不同的 hostname，并认证调用者。[独立预览 hostname](https://developers.cloudflare.com/sandbox/previews/serve-previews-on-their-own-hostnames/)

### 4.3 Vercel 账户和费用

Vercel Hobby 是免费计划，但官方限制为个人、非商业用途；商业用途需要 Pro 或 Enterprise。Hobby 也有 60 秒函数时长上限，Pro 可配置到 300 秒。[Vercel Hobby](https://vercel.com/docs/plans/hobby)；[Fair Use](https://vercel.com/docs/limits/fair-use-guidelines)

**建议：**

- 只用于个人非商业演示时，可先用 Hobby。
- 一旦公开用于商业验证、收费或团队业务，直接使用 Pro；不要把长时间 Agent 循环放进单个 Vercel 请求中，应使用异步 job 状态机。
- Vercel 默认提供 `*.vercel.app`，自定义域名可通过 A/CNAME 或 Nameserver 配置，并自动配置 SSL。[Vercel 自定义域名](https://vercel.com/docs/domains/working-with-domains/add-a-domain)

## 5. Supabase：认证、数据库和版本产物

### 5.1 为什么适合最小线上版本

Supabase Auth、Postgres 与 Storage 可在一个项目内完成用户身份、项目数据、对话历史和代码产物权限。Auth 使用 JWT，并可与 Postgres RLS 一起按行控制用户访问。[Supabase Auth](https://supabase.com/docs/guides/auth)

Next.js SSR 的官方方案使用 `@supabase/ssr` 和 Cookie session，并分别创建浏览器客户端与服务端客户端；当前仓库使用 Next.js 15，因此官方特别说明应使用 `middleware.ts`，而 Next.js 16 才改名为 `proxy.ts`。[Supabase Next.js SSR client](https://supabase.com/docs/guides/auth/server-side/creating-a-client)

### 5.2 最小数据模型建议（推论）

| 表/存储 | 最小职责 |
| --- | --- |
| `projects` | `id`、`owner_id`、标题、状态、当前版本 |
| `messages` | 项目、角色、自然语言内容、时间、关联版本 |
| `versions` | 版本号、生成/修改 prompt、artifact 路径、preview slug、构建状态 |
| `generation_jobs` | job 状态、sandbox 名称、错误、开始/结束时间、token/费用统计 |
| 私有 Storage bucket | 每个成功版本的源代码压缩包、manifest、可选构建日志 |

每张暴露表都应启用 RLS，并以 `owner_id = auth.uid()` 为核心策略。Supabase 官方明确指出暴露 schema 中没有 RLS 的表可能被具有 grant 的角色读写。[Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)

Storage 默认不允许上传，需通过 `storage.objects` 的 RLS 明确授权；可以按 JWT `sub`/`owner_id` 限制每个用户的对象。[Storage Access Control](https://supabase.com/docs/guides/storage/security/access-control)；[Storage ownership](https://supabase.com/docs/guides/storage/security/ownership)

**风险：** Supabase 数据库备份不包含 Storage 对象。因此源代码 artifact 进入生产后还需定义对象保留、版本删除与外部备份策略。[Supabase Database](https://supabase.com/docs/guides/database/overview)

### 5.3 密钥与回调配置

- 浏览器只使用 Supabase publishable key；服务端可使用 secret key。
- secret/service-role key 会绕过 RLS，绝不能进入浏览器、生成代码、sandbox 或 Git。Supabase 正在 2026 年底前弃用旧 `anon`/`service_role` 命名，建议新项目直接使用 `sb_publishable_...` 和 `sb_secret_...`。[Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys)
- Supabase Auth 的生产 `Site URL` 必须改为正式域名；Vercel preview 可加入通配 redirect URL，但官方建议生产使用精确 redirect path。[Supabase Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls)

### 5.4 计划与费用

Supabase Free 当前包括两个活动项目、50,000 MAU、500 MB 数据库和 1 GB 文件存储，但项目一周无活动会暂停；Pro 从 25 美元/月起，含 100,000 MAU、8 GB 数据库、100 GB 文件存储和 7 天每日备份。[Supabase pricing](https://supabase.com/pricing)；[Supabase billing](https://supabase.com/docs/guides/platform/billing-on-supabase)

**建议：** 开发阶段可用 Free；对外稳定演示和真实用户阶段使用 Pro，避免暂停并获得数据库备份。注意这些备份仍不覆盖 Storage 对象。

## 6. 用户需要准备的账号、账单、域名和本地依赖

### 6.1 立即需要

1. 安装 Docker Desktop 或 Colima，并确认 `docker info` 成功。
2. 重新登录 GitHub CLI：`gh auth login -h github.com`。
3. 准备 Cloudflare 账户，开通 Workers Paid，并允许创建 Worker、Durable Object、Container、DNS route。
4. 创建 Supabase 项目；开发期可 Free，计划对外稳定演示时升级 Pro。
5. 准备 Vercel 账户；若属于商业用途，选择 Pro。
6. 提供线上可用的模型配置 Secret。建议为 Atoms Demo 创建独立 DashScope Key 和额度，而不是长期共用 `ai-news-radar` Key。
7. 确认域名方案。安全优先的建议是主站和预览使用不同注册域。

### 6.2 由项目安装而不是用户全局安装

- `wrangler >= 4.141.0`
- `@cloudflare/sandbox` 当前 1.x
- `@supabase/supabase-js`
- `@supabase/ssr`
- Vercel CLI 可选；正式部署也可直接连接 GitHub

## 7. 最低月成本区间（不含模型和域名）

| 场景 | Vercel | Cloudflare | Supabase | 固定起步成本 |
| --- | ---: | ---: | ---: | ---: |
| 个人、非商业 MVP | Hobby $0 | Workers Paid $5 | Free $0 | 约 $5/月 |
| 面向真实用户的建议配置 | Pro（当前文档显示 $20/成员/月） | Workers Paid $5 | Pro $25 起 | 约 $50/月起 |

另计：模型调用费、Container 超额用量、日志、网络出口、域名、证书附加能力和可能的 Vercel/Supabase超额用量。Cloudflare Container 的 Workers、Durable Objects 与日志也是分别计费项。

## 8. 尚需用户明确的关键问题

这些问题会实质改变实现或成本，开始完整上线建设前需要确认：

1. **上线性质：** 只是个人公开演示，还是准备给真实用户/商业使用？这决定 Vercel Hobby 是否合规。
2. **目标用户地区：** 主要面向中国大陆还是海外？这会影响 Vercel、Cloudflare、Supabase 的可访问性、模型链路和域名合规方案。
3. **域名所有权：** 是否已有域名，并愿意把独立预览域的 DNS 交给 Cloudflare？是否能接受购买第二个廉价域名用于隔离预览？
4. **Beta 风险：** 是否接受 Cloudflare 当前 `durable_object` 调度和 snapshot 仍为 public beta，以换取最快上线？
5. **身份方式：** MVP 首版使用邮箱 Magic Link/OTP，还是 GitHub/Google 登录？邮箱方式仍需要配置生产 Site URL、redirect URLs 与邮件送达策略。
6. **模型凭证：** 是否允许 Atoms Demo 在生产继续使用 `ai-news-radar` 当前 DashScope 账户？建议新建独立 Key、额度上限和告警。
7. **生成应用是否允许联网：** 默认建议生成与预览环境禁用任意外网，仅允许受控安装依赖；若应用本身需要访问第三方 API，需要单独设计域名白名单和凭证代理。

## 9. 推荐落地顺序

1. 用户完成账号、账单、域名和 Docker/GitHub 准备。
2. 建立 Cloudflare Worker + Container 最小 staging，跑通固定 Vite 示例和独立预览域名。
3. 建立 Supabase Auth、RLS、项目/消息/版本/job 表和私有 artifact bucket。
4. 将当前模型 API 改为托管平台 Secret，并实现异步 generation job。
5. 把“预写 Vite 示例”替换为“模型生成文件 → sandbox 构建 → artifact 持久化 → preview URL”。
6. 实现多轮修改：取当前版本 artifact → 恢复到新/现有 sandbox → 变更 → 构建 → 生成新版本。
7. 完成安全与故障测试：越权、密钥泄漏、恶意依赖、无限循环、超大输出、构建超时、容器清理、preview 访问控制和费用上限。
8. 再完成完整 UI/Agent 体验和正式生产发布。

## 10. 事实、推论与风险标记说明

- 文中“官方事实”均来自 Cloudflare、Next.js、Vercel、Supabase 或 Web 标准的官方资料。
- “当前观察”来自本机只读检查和仓库已有可行性报告。
- “建议/推论”是基于官方约束为 Atoms Demo 选择的实现方案，不代表服务商保证。
- 定价和 Beta 状态会变化，正式购买或发布当天应再次核对官方页面。
