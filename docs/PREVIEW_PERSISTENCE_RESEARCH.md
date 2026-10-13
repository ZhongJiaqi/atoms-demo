# Atoms Demo 预览、持久化与线上沙盒方案调研

> 调研日期：2026-10-13  
> 范围：AI 生成 React/Vite 应用的安全构建、在线预览、项目层与生成应用层持久化、低成本部署。  
> 说明：文中的“官方事实”来自产品官方文档或 Web 标准；“项目判断”是结合 Atoms Demo 当前约束得出的建议。
> 已确认取舍：第一层必须在宿主页刷新后恢复同一项目和最新版本；第二层也尽量对齐 Atoms 的独立预览 Origin，让明确要求持久化的生成应用保留业务数据。

## 一、结论

当前最合适的方案不是长期运行 Vite 预览服务器，而是：

1. Vercel 上的 Next.js 作为可信控制面，负责模型调用、SSE、项目状态和预览编排。
2. Vercel Sandbox 只在生成或修改时短时启动，在隔离 microVM 中写文件、运行 TypeScript 检查和 Vite 生产构建。
3. 构建成功后，将 `dist` 作为不可变静态产物发布成独立的 Vercel Deployment；发布完成后立即停止 Sandbox。
4. 项目源码、消息、执行记录和版本元数据保存到 Vercel Private Blob；每个版本使用不可变路径，最新状态读取时绕过缓存。
5. 生成应用自身的 Todo、账目、习惯等数据通过独立预览 Origin 的受限存储，或固定 `Atoms Runtime` 与 `postMessage` 桥接保存；具体机制不暴露给生成代码。

该组合比“让 Sandbox/Vite 一直在线”更可靠，也比直接放宽 iframe 权限更安全；对于 1–2 个非商业演示用户，官方免费额度大概率足够，但这属于项目判断，仍需设置硬性配额并监控实际用量。

## 二、当前问题的标准层原因

### 官方事实

- HTML 标准规定：缺少 `allow-same-origin` 的 sandboxed iframe 会被强制为 opaque origin，并阻止访问 `localStorage`。[HTML Standard：sandboxed origin](https://html.spec.whatwg.org/multipage/browsers.html#sandboxed-origin-browsing-context-flag)
- MDN 同样说明，没有 `allow-same-origin` 时 iframe 使用特殊 origin，部分数据存储 API 会不可用。[MDN：iframe sandbox](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/iframe)
- Storage Access API 主要解决第三方 Cookie/未分区状态访问，并且 sandboxed iframe 需要同时使用 `allow-same-origin`、脚本权限和用户授权；它不是 opaque iframe 持久化的无提示替代方案。[MDN：Storage Access API](https://developer.mozilla.org/en-US/docs/Web/API/Storage_Access_API)
- `credentialless` iframe 使用短生命周期、随顶层页面导航或刷新失效的临时存储，而且该能力仍不是所有主流浏览器的稳定基线。[MDN：iframe credentialless](https://developer.mozilla.org/en-US/docs/Web/API/HTMLIFrameElement/credentialless)

### 项目判断

- 当前失败不是 React 或 `localStorage` 用法错误，而是测试要求与 iframe 安全策略冲突。
- 直接增加 `allow-same-origin` 只能让当前测试暂时通过；如果预览仍从主应用 origin 提供，会扩大生成代码权限，不能作为发布修复。
- Storage Access API 和 `credentialless` 都不适合作为本项目的持久化主方案。

## 三、推荐架构：短时构建 + 静态版本部署 + 项目持久化

### 3.1 构建层：Vercel Sandbox

#### 官方事实

- Vercel Sandbox 专门用于运行不可信或 AI 生成代码，每个 Sandbox 使用独立的 Firecracker microVM、文件系统和网络。[Vercel Sandbox](https://vercel.com/docs/sandbox)
- Sandbox 支持网络策略；不可信代码运行阶段可限制外连，防止代码或恶意依赖外传数据。[Vercel Sandbox 网络安全说明](https://vercel.com/kb/guide/running-opencode-securely-with-the-vercel-sandbox)
- Hobby 单次 Session 最长 45 分钟，默认 5 分钟；持久化 Sandbox 默认通过快照跨 Session 保存文件，默认快照保留 30 天。[Sandbox 生命周期与持久化](https://vercel.com/kb/guide/vercel-sandbox-duration-and-persistence)
- Hobby 当前包含每月 5 小时 Sandbox Active CPU、420 GB-hours Provisioned Memory、5,000 次创建、20 GB Sandbox Data Transfer 和 10 个并发 Sandbox。[Vercel Pricing](https://vercel.com/pricing)

#### 项目判断

- Sandbox 应只承担生成、构建、测试和产物导出，不应承担长期预览服务。
- 使用固定 React/Vite 依赖的基础快照，可以避免每次联网执行 `npm install`；写入模型生成文件后立即关闭网络，再运行构建。
- 每个项目应设置 CPU、内存、文件大小、进程数、构建时间和总修复轮数上限。

### 3.2 预览层：每个版本发布静态 Deployment

#### 官方事实

- Vercel REST API 支持上传文件并创建 Deployment，每次 Deployment 都得到唯一 URL，适用于自定义工作流和多租户应用。[Vercel Deployments](https://vercel.com/docs/deployments/overview)
- Build Output API 可以将静态文件放入 `.vercel/output/static`，由 Vercel Edge CDN 提供；`config.json` 的 routes 可以为响应添加 CSP 等安全头。[Build Output API 静态文件](https://vercel.com/docs/build-output-api/primitives)；[Build Output API 配置](https://vercel.com/docs/build-output-api/configuration)
- Hobby 账户当前最多每天创建 100 个 Deployment。[Vercel Limits](https://vercel.com/docs/limits)

#### 项目判断

- 每轮修改发布一个不可变静态版本，预览不会因为 Sandbox 休眠、进程退出或端口变化而失效。
- 生成应用只包含前端 React/Vite，静态发布完全覆盖当前 MVP 范围。
- 静态 Deployment 应设置至少以下 CSP：`connect-src 'none'`、`form-action 'none'`、`object-src 'none'`、受控的 `frame-ancestors`。
- “新标签页打开”应打开可信的 Atoms Preview Wrapper；Wrapper 再嵌入生成页面并提供存储桥，不直接把未经包装的生成页面作为产品入口。
- 需要定期删除过期版本，避免触及 Deployment 数量和保留策略限制。

### 3.3 项目持久化：Private Blob 作为控制面数据源

#### 官方事实

- Vercel Private Blob 的读写需要认证 token，私有文件不能直接通过公开 URL 读取。[Vercel Private Blob](https://vercel.com/docs/vercel-blob/private-storage)
- Hobby 当前包含 1 GB Blob 存储、每月前 2,000 次高级操作和 10 GB 数据传输，超额后 Hobby 不会自动收费，但服务会受限。[Vercel Blob 定价](https://vercel.com/docs/vercel-blob/usage-and-pricing)
- Private Blob 已支持 `useCache: false` 的一致读取；Blob 写入还支持 ETag 条件写，适合防止并发覆盖。[Private Blob 一致读取](https://vercel.com/changelog/vercel-blob-now-supports-consistent-reads-on-private-storage)；[Vercel Blob SDK](https://vercel.com/docs/vercel-blob/using-blob-sdk)

#### 项目判断

- 不要按每个源码文件分别写 Blob；每个版本保存一个项目 JSON 或压缩包，可显著降低高级操作次数。
- 推荐路径：
  - `projects/{ownerId}/{projectId}/versions/{version}.json`
  - `projects/{ownerId}/{projectId}/state/{timestamp}.json`
  - 一个小型 latest 指针，使用 ETag 条件写或读取时按版本号选择最新记录。
- Blob 适合本次 1–2 人 Demo 的项目源码和会话记录；如果以后需要复杂查询、多人权限和高频业务数据，再迁移到 Supabase/Postgres。

### 3.4 生成应用数据：独立 Origin 或固定 Atoms Runtime 存储桥

#### 官方事实

- `window.postMessage()` 是浏览器提供的跨 origin 窗口通信机制；接收方必须校验 `origin`、`source` 和消息结构，并应使用精确的 `targetOrigin`。[MDN：postMessage](https://developer.mozilla.org/en-US/docs/Web/API/Window/postMessage)
- 对 opaque sandbox，消息的 origin 会序列化为 `null`，不能仅靠 origin 鉴别发送者，此时必须比较 `event.source` 与目标 iframe 的 `contentWindow`。[MDN：sandbox 消息校验](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/sandbox)

#### 项目判断

- 给生成项目注入固定且不可由模型修改的 `Atoms Runtime`，暴露：
  - `useAtomsState(key, initialValue)`
  - `atomsStorage.get/set/remove`
  - `reportReady/reportRuntimeError`
- 父页面只接受来自当前 iframe `contentWindow`、当前 `projectId`、当前版本和随机 channel token 的消息；校验 JSON 结构，限制单项目容量和写入频率。
- 第一阶段将数据保存到父页面 IndexedDB 或 `localStorage`，键空间为 `atoms:{projectId}:{key}`，即可满足同一浏览器刷新保留数据。
- 第二阶段如需跨设备同步，父页面把相同操作转发到认证 API/Supabase；生成应用接口保持不变。
- 模型提示词应禁止直接调用 `localStorage`、`sessionStorage`、IndexedDB 和网络 API；静态校验器也应拒绝这些 API，避免生成结果绕过 Runtime。

## 四、备选方案比较

| 方案 | 隔离 | 预览可靠性 | 浏览器兼容 | 免费/低成本 | 工程量 | 结论 |
|---|---|---:|---:|---:|---:|---|
| Vercel Sandbox 短时构建 + 静态 Deployment + 存储桥 | microVM + 独立部署 origin | 高 | 高 | 适合 1–2 人 Demo | 中 | 推荐 |
| Vercel Sandbox 长期运行 Vite public port | microVM | 中低，Session 停止后不可用 | 高 | 空闲仍占内存额度 | 低到中 | 仅开发调试 |
| Sandpack | 第三方 bundler iframe | 中 | 较高 | 浏览器侧计算 | 中 | 可做快速原型，不替代真实 Vite 生产构建 |
| WebContainers | 浏览器内 Node/Wasm | 中 | Chromium 最稳，Safari/Firefox 仍有限制 | 计算成本转移到用户浏览器 | 高 | 不适合作为本月公开 Demo 主路径 |
| E2B | Firecracker microVM | 中高 | 高 | Hobby 为一次性 100 美元 credit，不是持续月度免费额度 | 中 | Vercel Sandbox 不可用时的首选备选 |
| Cloudflare Sandboxes | microVM/Container | 高 | 高 | 需要 Workers Paid，非零成本 | 高 | 后续扩展备选 |

### Sandpack 与 WebContainers 的官方依据

- Sandpack 在浏览器中运行，bundler 位于独立 iframe，可传入 React 文件和依赖。[Sandpack 文档](https://sandpack.codesandbox.io/docs)
- WebContainers 在浏览器内运行 Node.js/Vite，并可从 `server-ready` 事件得到 iframe 预览 URL。[WebContainers Quickstart](https://webcontainers.io/guides/quickstart)
- WebContainers 依赖 SharedArrayBuffer 和跨 origin 隔离；Chrome/Chromium 支持最好，Safari 和 Firefox 仍有差异，第三方 Cookie/Service Worker 设置可能阻止运行。[WebContainers 浏览器支持](https://webcontainers.io/guides/browser-support)；[WebContainers 浏览器配置](https://webcontainers.io/guides/browser-config)

### E2B 与 Cloudflare 的官方依据

- E2B 提供独立 Firecracker microVM 和外部端口 URL；Hobby 当前为 100 美元一次性使用额度、Session 最长 1 小时。[E2B Sandbox SDK](https://e2b.dev/docs/sdk-reference/js-sdk/v2.6.2/sandbox)；[E2B Pricing](https://e2b.dev/pricing)
- Cloudflare 明确建议预览使用不承载主应用的 hostname，并让每个预览 hostname 隔离浏览器存储。[Cloudflare：独立预览 hostname](https://developers.cloudflare.com/sandbox/previews/serve-previews-on-their-own-hostnames/)

## 五、为什么不把 Sandbox Drive 作为唯一数据源

### 官方事实

- Vercel Drives 已于 2026-09-23 向 Hobby、Pro 和 Enterprise 开放 public beta；Hobby 包含 15 GB Drive 存储和每月各 30 GB 的读写量。[Vercel Drives public beta](https://vercel.com/changelog/drives-for-vercel-sandbox-are-now-in-public-beta)
- Drive 可以跨 Sandbox 运行和不同 Sandbox 实例保留工作目录，但一次只能有一个读写挂载。[同上](https://vercel.com/changelog/drives-for-vercel-sandbox-are-now-in-public-beta)

### 项目判断

- Drive 很适合保存 `node_modules`、构建缓存或工作目录镜像。
- 但 Next.js 控制面不能像普通数据库一样直接查询挂载目录；如果把消息和源码只放在 Drive，读取 Code 面板或恢复工作区时可能被迫重新启动 Sandbox。
- 因此建议 Private Blob 做控制面事实源，Sandbox 快照或 Drive 只做构建缓存。等 Drives 退出 beta 后再评估是否承担更多职责。

## 六、实施顺序

### P0：云端项目持久化与恢复

1. 抽象 `ProjectRepository`，本地文件实现继续服务开发环境。
2. 新增 Private Blob 实现，项目每个版本使用不可变单文件保存。
3. URL 携带 `projectId`，刷新时恢复消息、执行记录、源码和最近预览版本。
4. 三个代表性 E2E 用例在页面刷新后核对同一项目、源码、消息、执行事件、最新成功版本和预览。

### P1：线上构建与静态预览

1. 抽象 `SandboxProvider`，保留本地实现，新增 Vercel Sandbox 实现。
2. 在 Sandbox 中执行真实 TypeScript/Vite 构建和最多两轮日志修复。
3. 将 `dist` 组装为 Build Output API 产物并通过 Deployments API 发布。
4. 添加 CSP、安全响应头、预览恢复和过期版本清理。

### P2：生成应用数据与最小访问控制

1. 为生成应用提供独立预览 Origin；如果免费部署无法提供项目级 Origin，则实现固定 Runtime 与受限存储桥。
2. 让三个代表性用例的任务、账目、习惯和状态在 Viewer 与宿主页刷新后保留。
3. 增加 1–2 个演示账号或邀请码、调用频率限制和每用户项目上限。
4. 实现版本历史列表、恢复到指定版本和继续修改。
5. 接入最小发布/分享流程。

### P3：线上验收

1. 对线上 URL 运行三个已固化的真实模型 E2E 用例。
2. 增加 Sandbox 超时、模型失败、静态部署失败和 Blob 配额耗尽场景。
3. 从大陆真实网络测试首页、SSE、预览静态资源和模型请求；Vercel 官方材料不能替代大陆网络实测。

## 七、最终决策建议

本月 MVP 采用：

**Vercel Hobby + Vercel Sandbox + 静态 Vercel Deployment + Private Blob + 独立预览 Origin/受限存储桥。**

暂不引入 Supabase、Cloudflare Sandboxes 或 WebContainers，避免增加账号、付费和浏览器兼容变量。第二层先只保证同一浏览器刷新后的项目内数据；只有需求升级为跨设备同步、多人协作或生成后端服务时，再引入数据库和更复杂的运行时。
