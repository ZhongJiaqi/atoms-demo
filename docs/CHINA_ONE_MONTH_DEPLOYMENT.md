# Atoms Demo 中国大陆一个月零固定成本部署方案

## 1. 已确认约束

- 使用性质：个人、非商业演示。
- 用户规模：1–2 位受邀真实用户。
- 用户地区：中国大陆。
- 目标周期：2026 年 10 月内可正常在线体验。
- 成本目标：优先使用免费方案，接受 Vercel 在中国大陆没有官方可用性保证这一风险。
- 核心体验：用户通过自然语言首次生成 React 应用、在 iframe 中预览，并通过多轮对话继续修改。

## 2. 推荐结论

首版采用 **Vercel Hobby + Supabase Free + 现有 DashScope 模型 API + 浏览器隔离预览**，固定平台成本目标为 **0 元/月**。

不在首版购买 Cloudflare Workers Paid，也不在线执行任意 `npm install`、Vite 配置、Node.js 脚本或后端代码。模型生成受约束的 React/Vite 前端源码；服务端只使用固定编译器和固定依赖生成静态产物；产物只在受限 iframe 中执行。

这项折中保留了用户能看到的核心闭环，也避免为了 1–2 位用户承担付费容器和不可信服务端代码执行风险。

## 3. MVP 拓扑

```text
中国大陆用户浏览器
  |
  v
Vercel Hobby：Next.js 主站
  |- 邀请码登录与会话 Cookie
  |- 生成/修改 API
  |- 调用 DashScope OpenAI-compatible API
  |- 校验模型输出的文件合同
  |- 使用固定编译配置生成静态 JS/CSS
  `- /preview/{versionId} 返回隔离预览文档
        |
        `- <iframe sandbox="allow-scripts">（opaque origin）

Supabase Free（仅由 Next.js 服务端访问）
  |- 用户、项目、消息、版本、任务状态
  `- React/Vite 源码与编译产物
```

浏览器不直接连接 Supabase，避免把 Supabase 的跨境可达性变成用户端硬依赖，也避免向浏览器暴露高权限密钥。

## 4. 生成能力边界

### 首版支持

- React + TypeScript 的单页应用。
- 固定 Vite 项目结构，可下载后在标准 Vite 环境运行。
- 普通 CSS、响应式布局和有限的内置图标/组件。
- 首次生成、错误反馈、版本保存和多轮修改。
- 按钮、表单、本地状态、标签页、筛选等纯前端交互。
- 通过 iframe 实时预览当前稳定版本。

### 首版不支持

- 模型自定义 `package.json`、安装任意 npm 依赖或执行任意构建脚本。
- 生成并运行 Node.js/Python 后端、数据库迁移、定时任务或任意 Shell 命令。
- 预览应用访问宿主 Cookie、模型密钥或 Supabase 密钥。
- 预览应用任意访问公网；首版 CSP 默认关闭网络请求。

如果用户需求超出该边界，Agent 应明确提示“当前演示版仅支持前端应用”，而不是伪装成功。

## 5. 安全边界

- 模型只能修改允许清单内的文件，例如 `src/App.tsx`、`src/styles.css` 和少量数据文件。
- 编译配置、入口文件、依赖版本和预览 HTML 由平台持有，模型不可修改。
- 编译阶段只解析和打包源码，不执行生成代码，也不加载生成的 Vite 插件或 npm 脚本。
- iframe 只授予 `allow-scripts`，不授予 `allow-same-origin`、表单提交、弹窗、下载或顶层导航能力。
- 预览响应设置严格 CSP，默认 `connect-src 'none'`、`form-action 'none'`，图片只允许同文档、`data:` 或平台明确放行的来源。
- 宿主接收 iframe 消息时同时校验 `event.source` 和消息结构；不信任 opaque origin 的字符串来源。
- 每个账号限制每日生成次数，并在服务端限制输入长度、模型 token、文件数量和产物大小。

## 6. 成本

| 项目 | 首月目标 | 说明 |
| --- | ---: | --- |
| Vercel Hobby | 0 元 | 仅适用于已确认的个人非商业演示；控制在免费额度内。 |
| Supabase Free | 0 元 | 1–2 位用户的文本源码和少量版本数据远低于免费额度。 |
| 浏览器隔离预览 | 0 元 | 不使用线上容器，不产生容器固定费用。 |
| DashScope 模型 | 现有额度 | 沿用 `ai-news-radar` 已验证 API；必须设置生成次数和 token 上限。 |
| 域名 | 0 元 | 首月直接使用 `*.vercel.app`；若实际网络测试不稳定，再评估自定义域名。 |

成本结论不包含模型超额费用。不能把 API Key 放入前端，也不能允许匿名无限调用。

## 7. 大陆可达性：观察与风险

### 官方观察

- Vercel 官方说明其在中国大陆没有基础设施或 CDN 节点，`.vercel.app` 可能被阻断或限速，并且即使使用自定义域名也不能保证大陆可用性或性能。
- Supabase 的亚太区域包括新加坡、东京、首尔等，但没有中国大陆区域。
- Cloudflare 中国网络是 Enterprise 的单独订阅，并要求 ICP 备案，不符合本项目的免费目标。
- 腾讯云官方说明普通中国香港轻量服务器不保障中国内地到香港的跨境公网质量。

### 项目决策

用户已明确接受 Vercel 路线。项目不宣称平台级大陆 SLA，而以两位真实用户的实网验收作为“本月正常体验”的通过标准。

参考资料：

- [Vercel：中国大陆访问说明](https://vercel.com/kb/guide/accessing-vercel-hosted-sites-from-mainland-china)
- [Vercel Hobby 计划](https://vercel.com/docs/plans/hobby)
- [Supabase 可用区域](https://supabase.com/docs/guides/platform/regions)
- [Supabase 定价](https://supabase.com/pricing)
- [Cloudflare 中国网络](https://developers.cloudflare.com/china-network/)
- [腾讯云中国香港轻量服务器价格与网络说明](https://cloud.tencent.com/document/product/1207/73452/)

## 8. 实网上线门槛

必须由两位目标用户在各自真实网络完成以下验收，而不能只由开发机证明：

1. 连续两天、至少两个时间段打开主站，首页和工作区可以加载。
2. 登录后完成一次首次生成，页面在限定时间内进入可预览状态。
3. 预览中的按钮或表单交互正常，刷新后仍能恢复当前版本。
4. 发起一次多轮修改，成功得到版本 2，并可在版本 1/2 之间切换。
5. 失败时页面能显示明确错误，不会无限等待或扣除重复额度。

建议目标：主站首次可见内容不超过 8 秒；生成过程可持续展示状态，90 秒内成功或明确失败。该数字是项目验收目标，不是 Vercel 官方承诺。

## 9. 回退条件

以下任一情况连续出现两次，就停止继续优化 Vercel 免费路径并切换方案：

- 两位用户中任一人持续无法打开 `*.vercel.app`。
- 预览静态资源频繁失败，导致生成成功但页面不可用。
- Vercel 函数时限或包体限制使固定编译无法稳定完成。
- Supabase 服务端链路导致项目或版本不能可靠保存。

回退顺序：

1. 先绑定用户已有的自定义域名并复测。
2. 再评估中国香港轻量服务器；接受约 38 元/月起且跨境质量仍无官方保证。
3. 只有需要任意依赖、真实 Vite/Node 运行或生成后端时，才启用 Cloudflare Sandboxes（Workers Paid，至少 5 美元/月）或独立云主机。

## 10. 开发顺序

1. 把当前 PoC 收敛为受约束的项目文件合同和固定编译流程。
2. 完成邀请登录、项目/消息/版本数据模型和服务端持久化。
3. 完成首次生成状态机、隔离 iframe 和错误恢复。
4. 完成多轮修改、版本 2 创建和版本切换。
5. 初始化 Git、恢复 GitHub/Vercel 授权并部署 staging。
6. 由两位大陆用户完成实网验收；只修复阻断闭环的问题。

进入实现前只需确认一个产品边界：**本月 Demo 接受“只生成纯前端 React 应用，不生成可执行后端和任意 npm 依赖”。**
