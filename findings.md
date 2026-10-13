# Findings and Decisions: Atoms Demo

## 当前冲刺范围（2026-10-13）

- 本轮仅调查四项：首页视觉布局与样式、Agent 工作区布局、首次生成应用交互、多轮对话修改交互。
- 本轮只输出中文 `docs/UI_SPEC.md` 与中文 `docs/INTERACTION_SPEC.md`，不编写应用代码。
- 优先保留关键页面截图；既有超出该范围的模型、部署、后端和连接器资料不进入本轮规格。
- 所有产品结论必须明确标记为观察结果、推测或未知。

## 当前冲刺关键证据

- 外部 CDP 在临时匿名浏览器上下文中打开公开首页；REA 随后仅被动发现该 Target。目标列表 Evidence：`ev_67d03cd7e75394807b0ae6a46fd8a38aaa2444bfcf4d5e145ff56ea33658ff26`。
- REA 捕获公开首页当前可见视口，尺寸为 2400×1406，状态为 `complete_within_window`。截图 Evidence：`ev_c11092ce1893f3252874e9771a3e3279f9b4a6c2be9e63de9932adb2ea942100`；PNG SHA-256：`a652859adc1a01ce27e9522c3509d877508a18ec379c9699b13738dfdc84d1db`。
- **观察：首页首屏视觉。** 2400×1406 桌面视口采用近白/暖灰单色背景与大面积留白。顶部左侧为 Atoms 黑色标志，旁接浅灰胶囊导航（资源、社区、关于、定价）；右侧为浅灰“登录”和亮蓝“注册”胶囊按钮。
- **观察：首页 Hero 层级。** 内容沿页面中轴纵向排列：浅灰公告胶囊 → 八个彩色 Agent 圆形头像 → 超大粗黑中文主标题“把想法变成可销售的产品” → 深灰副标题 → 白色大圆角提示词输入卡。卡片右下为亮蓝“开始”按钮，左下为圆形加号入口。
- **观察：首页风格。** 视觉语言依赖黑/灰中性色、超大字号、圆角胶囊/卡片和少量亮蓝主行动色；几乎没有分隔线或复杂背景装饰。Agent 头像承担主要彩色与人格化表达。
- **观察：首页结构证据。** 被动页面检查记录 4,453 个 DOM 节点，并在无障碍文本中确认登录、注册、社区、关于、定价、后续能力区和 FAQ。Evidence：`ev_75096127ab83eaffa70f9458b8c6b34a017d1a6acc636967e1eb387af29257a8`。
- **限制：首页截图只覆盖当前可见首屏。** REA 未滚动，因此首屏以下模块的空间细节不能从本张截图直接确认；无障碍结构只证明后续区块存在。
- 外部 CDP 将已登录页面导航回用户既有项目；REA 随后被动确认项目 URL 与标题。目标列表 Evidence：`ev_f44af7126f3a3be25e738b53c87de84d79779610d0c0523d8497a4bb9bdd8092`。
- REA 捕获 Agent 工作区当前可见视口，尺寸 2940×1602，状态为 `complete_within_window`。截图 Evidence：`ev_0d16fcae218c7f2496cd6e9bb7dadb637de8703b9a7bf11eaa810121da6eb4e9`；PNG SHA-256：`233ccd29537ca4c17e8ea4480eba7085c7bed11380e75b1e72db8d425a470e54`。
- **观察：Agent 工作区整体布局。** 桌面端为三栏结构：最左为约 100 px 的收起式全局侧栏；中间约 900 px 为项目对话/生成时间线；右侧占主要宽度，为圆角大容器形式的“应用查看器”。
- **观察：工作区顶栏。** 中间栏顶部显示项目名及下拉入口，右侧查看器上方依次出现历史/折叠控制、“应用查看器”胶囊、若干圆形工具按钮，以及最右侧分离的“分享”与亮蓝“发布”按钮。
- **观察：对话栏。** 当前滚动位置显示质量验证、交付说明、继续建议和蓝色描边“版本 1”卡片；底部固定大圆角输入框，包含添加、语音和发送入口。生成完成后仍保留同一输入面供下一轮文本修改。
- **观察：App Viewer。** 查看器内部有独立工具条，包括桌面/手机视图、刷新、Home 路由下拉、新标签页和控制台；下方直接渲染生成应用。宿主工具栏与生成应用自己的工具条视觉上分层。
- **观察：首次生成的过程可见性。** 页面无障碍结构保留了从初始化、读取文件、写入文件、终端命令、质量验证、可视化检查到交付说明的 13 步记录，而不是只显示一个统一 loading。
- **观察：版本与下一轮入口。** 无障碍结构确认“版本”“版本 1”“历史记录”“克隆”和底部可编辑输入区；这证明单轮结果可形成版本且页面提供继续对话入口。多版本切换行为尚未被直接观察。
- **观察：临时遮挡。** 本张原始工作区截图右下有 PostHog 调研问卷，左下有声音通知提示；它们属于临时浮层，不应写入核心布局规格。
- 工作区被动页面检查 Evidence：`ev_512a773e3ca0d0ddc62c7ba7bbcf1ee079595c1630319962dee16c251dc3ece5`，记录约 5,409 个 DOM 节点及上述无障碍文本。
- 外部 CDP 仅关闭问卷和声音提示两个临时浮层后，REA 捕获无遮挡工作区截图。Evidence：`ev_9eb4178732789882237464957a6afca53cdb20d59f740b15f235991e0e9b20ea`；2940×1602；PNG SHA-256：`98de8d6fc204462a1ee385db6dac55bb600c478219e0606411eb8d8f78acd9c7`。
- **观察：无遮挡布局比例。** 最左全局栏只保留图标；中间对话栏约占页面三分之一；右侧 Viewer 约占三分之二。两栏都从顶栏下延伸到视口底部，各自拥有独立滚动内容。
- **观察：对话到预览的空间关系。** 生成交付说明、版本卡和下一轮输入在中间栏连续排列；右侧同一时刻展示运行结果，使用户无需离开对话即可核对应用。
- **观察：首次生成起点。** 工作区记录的原始需求为“个人主页生成器：输入姓名 / 职业 / 技能 / 联系方式 → 生成排版精良的个人主页。”，并标注“让智能体团队实现”。证据来自 `ev_24a0b…` 的有序无障碍节点。
- **观察：首次生成反馈节奏。** Agent 先显示 `I’m getting started.` 并用自然语言概述实现方向；之后在每组工具操作前说明当前意图，例如读取模板、建立设计规范、实现数据模型、构建界面、运行校验和渲染检查。
- **观察：步骤呈现。** 工具事件以内嵌可展开项呈现，包含“读取文件”“写入文件”“在终端中运行命令”“可视化检查”，部分组提供“显示 N 个更多”，说明详细步骤默认折叠以控制信息密度。
- **观察：完成状态。** 校验通过后，Agent 给出交付说明、核心能力列表、质量验证结果和下一步建议；随后出现“完成个人主页生成器首版”与“版本 1”卡片，右侧 App Viewer 保持可交互结果。
- **观察：首次生成流程的可见状态序列。** `需求消息 → Agent 启动说明 → 工具/进度时间线 → 质量与视觉验证 → 交付总结 → 版本卡 → 持续可用的预览与后续输入框`。
- **未知：** 现有保留 Evidence 没有直接展示提交瞬间是否出现独立积分确认、需求规划审批或中间空白骨架，因此本轮规格不得把这些写成已观察的必经步骤。
- **观察：多轮修改已直接触发。** 外部 CDP 在既有项目底部输入框提交“把成品页的朱红强调色改为深蓝色，其他布局和内容保持不变。”；REA 随后被动捕获运行态。截图 Evidence：`ev_48bdf2a20a2b8ce8cb58afa5e53d726b00c98085c6f6b7d92415f06eb69299e2`；页面 Evidence：`ev_b6a3dfc242a9625158ef805cc9e09115b23202c578ebef8c945668ec12e6e7b0`。
- **观察：新消息追加方式。** 用户请求以浅灰圆角气泡追加在版本 1 卡片之后；同一对话流中出现 Agent 头像、`Alex｜工程师` 和 `Alex 正在思考`，没有跳转到新页面。
- **观察：运行态控件。** 输入框右下的发送箭头切换为黑色圆形停止方块；顶栏出现蓝色描边“跟随智能体”按钮；“发布”按钮在处理中呈淡蓝禁用状态。
- **观察：多轮修改的范围确认。** Agent 首句为“我先确认成品页的强调色定义，只修改颜色，保持布局、内容和编辑工作台不变。”，随后显示“读取文件 profile.ts”，并说明将朱红色替换为深蓝色 `#173B65`，预览与导出同步生效。
- **观察：预览连续性。** 修改开始后右侧 App Viewer 没有消失或切换为全屏 loading，仍显示上一个可用版本；因此用户在后台修改期间仍可查看当前成品。
- **观察：多轮修改的执行阶段。** 后续状态依次为“颜色已替换，我现在运行代码检查和生产构建”→“代码检查与构建通过，现在确认成品页显示深蓝强调色且布局内容保持原样”→“界面检查确认修改符合要求，我记录本次完成状态”。Evidence：`ev_2a4b0d01f9edcf0b94de552cb1f5a120af622779944f9442751a80a93a6ed75a`、`ev_244f96b7c9a21aa93ee4548344ea0aa9b1d6a8b33a28de52be2be7fb2b248128`。
- **观察：修改完成说明。** Agent 明确回报深蓝色为 `#173B65`，预览与导出 HTML 同步更新，布局、内容和编辑工作台配色保持不变；同时说明代码检查、构建和界面检查已通过。
- **观察：独立版本封装阶段。** Agent 已给出完成说明后，宿主仍显示“正在构建版本”，表明应用修改完成与新版本卡生成是前后相继的两个 UI 状态。
- **观察：多轮修改终态。** 新版本封装完成后出现蓝色描边“版本 2”卡片，标题为“成品页强调色改为深蓝”；页面检查同时确认“恢复到此版本”入口。Evidence：截图 `ev_60bd12ac7f454ac530cb0cb8a4210fbd1048bcb5abb0cca8799417f1920b18ee`，页面 `ev_65743bd1389adb027a8a83bdc43c65c93a3f4769c7caaed7c19c5577af1ec239`。
- **观察：预览更新。** 终态截图中生成应用的方形标记和横向强调线已由朱红切换为深蓝，其他可见排版保持一致；右上“发布”按钮恢复为可用亮蓝状态，运行中的“跟随智能体”和停止控件消失。
- **观察：多轮修改状态序列。** `用户追加修改消息 → Agent 思考/范围确认 → 文件读取与变更说明 → 代码/构建检查 → 可视化检查 → 完成总结 → 正在构建版本 → 新版本卡 + 预览刷新 + 发布恢复可用`。
- **推测：** “恢复到此版本”很可能执行版本回滚，但本轮没有点击验证，因此只在规格中列为已观察入口，不声明其完整行为。

## Requirements

- Deliver all three outcomes: reverse-engineering report, build-ready product/technical specification, and a working implementation.
- Mandatory four-stage loop:
  1. User enters a one-sentence idea or requirement.
  2. One or more agents process it and generate code/application output.
  3. The page renders a runnable, interactive application in an iframe.
  4. The generated result and its data survive refresh and browser restart.
- Generated output must demonstrate a full-stack application shape with login, database, and backend API capability.
- Cover both anonymous-homepage and authenticated-dashboard entry points.
- Include login/registration, onboarding/workspace initialization, prompt entry, build-mode selection, requirement planning, credit confirmation, generation progress, agent workflow, project workspace, preview, follow-up modification, version history, publishing, export, and GitHub-related flow.
- Exclude visual editor and code editor.
- Completion means the first interactive preview exists and remains functional/persistent after re-entry and refresh.
- The demo must complete under model outage, no quota, errors, or no network through a deterministic fallback.
- Input is plain text only.
- Competition mode has exactly three branches.
- Preserve visible multi-agent roles and approval points.
- Representative cases may be designed for stable demonstration. User examples: priority/deadline/drag-sort project board, personal homepage, mortgage calculator with prepayment comparison.
- Current Atoms account may be used. Test project creation/modification/deletion, credit spend, test-file upload, publishing, authenticated observation, scripts/source maps/API shapes/stream events/non-secret bodies/CDN origins are authorized.
- External connector features listed in question 18 are out of the reverse-engineering scope.
- Primary deliverables: PRD, live Atoms Demo, source code, and GitHub repository URL.
- Required client coverage: responsive sizes and multiple browsers.
- Atoms account currently shows a 360-credit balance; the user authorized up to 360 credits for reference-flow testing.
- GitHub repository must be public, named `atoms-demo`, and live under the user's personal GitHub account.
- No API key or other runtime secret may be committed to or stored in the GitHub repository.

## Research Findings

- Existing reverse-engineering log: `/Users/jiaqizhong/atoms-reverse-engineering.md`.
- REA browser tooling is connected and has retained evidence for anonymous homepage, login page, and authenticated dashboard.
- Logged-out homepage supplies login/register and prompt-entry surfaces; authenticated dashboard supplies prompt composer, build-mode control, credits, public examples, projects, and connector promotion.
- Login/registration currently share one first-step page with Google and email paths; the email second step was intentionally not submitted.
- Three distinct model branches do not inherently require three endpoint shapes: one gateway may expose three model IDs, or separate provider adapters may call separate APIs.
- `ai-news-radar/.env.local` contains a configured DashScope OpenAI-compatible endpoint and a present API key. The key value was not printed or copied into project files.
- A live read-only `/models` request returned HTTP 200 with 175 model IDs, confirming that the credential and endpoint currently work.
- Configured candidates present in the live model list: `qwen3.6-flash`, `qwen3.6-27b`, `qwen3.6-plus`, and `qwen3.7-max`.
- Configured candidate absent from the live model list: `deepseek-v4-flash`; do not use it in Atoms's competition trio without a later successful probe.
- Minimal generation probes for `qwen3.6-flash`, `qwen3.6-27b`, and `qwen3.7-max` all returned `403 AllocationQuota.FreeTierOnly`; a valid key and model listing do not guarantee callable quota.
- `ai-news-radar` maintains a newer confirmed-free whitelist. Strong current candidates for Atoms are `qwen3.8-flash`, `qwen3.8-27b`, and `kimi-k3`, subject to live probes.
- Batched live probe on 2026-10-13 returned HTTP 200 for `qwen3.8-flash`, `kimi-k3`, `qwen3.8-max-0902`, `deepseek-v4.1-flash`, `glm-5.3`, `qwen3.8-2.4t-a95b`, and `qwen3.8-max`.
- `qwen3.8-27b` returned HTTP 403 `AllocationQuota.FreeTierOnly` and must not be selected for the current demo configuration.
- Probe latency for the successful candidates ranged from about 0.7 s to 3.3 s. `deepseek-v4.1-flash` returned HTTP 200 but no visible content under the deliberately tiny four-token limit; the later functional retry succeeded.
- Functional structured-generation probes passed for `qwen3.8-flash` (~1.8 s), `kimi-k3` (~3.3 s), `qwen3.8-max-0902` (~2.2 s), and `deepseek-v4.1-flash` (~1.8 s): each produced parseable JSON matching the required application-spec schema.
- `glm-5.3` returned HTTP 200 but used the full 256-token allowance in required thinking mode and did not produce a usable JSON body. It is callable but unsuitable for the demo's primary low-latency competition path under the tested budget.
- Selected competition trio: `qwen3.8-flash`, `kimi-k3`, and `deepseek-v4.1-flash`. Selected first online backup: `qwen3.8-max-0902`.
- The user-provided DashScope quota screenshot confirms that the current free-model set contains exactly seven aliases: `qwen3.8-flash`, `kimi-k3`, `qwen3.8-max-0902`, `deepseek-v4.1-flash`, `glm-5.3`, `qwen3.8-2.4t-a95b`, and `qwen3.8-max`. This matches the live probe results and confirms that `qwen3.8-27b` is not a current free model.

### Free-model quota snapshot (2026-10-13)

| Model | Remaining quota | Expiration shown |
| --- | ---: | --- |
| `qwen3.8-flash` | 489.64K / 1M | 2026-11-25 |
| `kimi-k3` | 999.94K / 1M | 2026-11-17 |
| `qwen3.8-max-0902` | 999.98K / 1M | 2026-12-01 |
| `deepseek-v4.1-flash` | 999.99K / 1M | 2026-12-13 |
| `glm-5.3` | 999.93K / 1M | 2026-11-23 |
| `qwen3.8-2.4t-a95b` | 999.91K / 1M | 2026-11-12 |
| `qwen3.8-max` | 185.54K / 1M | 2026-11-01 |

## Technical Decisions

| Decision | Rationale |
| --- | --- |
| Start project root at `/Users/jiaqizhong/atoms-demo` | Clear, dedicated workspace under the writable root. |
| Keep three deterministic fallback generators | Makes outage/no-quota demonstrations reliable. |
| Separate reference observations from implementation choices | Static/runtime evidence does not prove how the clone should be architected. |
| Use secret-backed provider adapters | Keeps credentials out of source and permits either one multi-model gateway or multiple provider APIs. |
| Public repository name is `atoms-demo` | Explicit user direction. |
| Reuse the existing DashScope gateway through Atoms-specific secret variables | One working gateway can provide three distinct models while keeping the source repository secret-free. |
| Fix the three model branches to Qwen 3.8 Flash, Kimi K3, and DeepSeek V4.1 Flash | All passed a live schema-valid generation check and provide family diversity through one gateway. |
| Use Qwen 3.8 Max 0902 as the first online backup | It passed the same contract and can replace a failed primary branch before deterministic offline fallback. |
| Configure the three primary aliases and backup alias through environment variables | All currently free allocations have explicit expiry dates; operators must be able to rotate models without redeploying changed source. |

## Open Decisions

- Resolved: maximum Atoms credit spend authorized for reference testing is 360 credits; use only what is necessary to close core evidence gaps.
- Whether generated full-stack behavior is constrained to a safe generated-app SDK or permits arbitrary backend code.
- Hosting/persistence/identity stack.
- Public/private audience for the live deployment and deployment ownership.
- Whether PRD is a new document in this repository or appended to the existing research log.

## Issues Encountered

| Issue | Resolution |
| --- | --- |
| Sandboxed network request returned DNS `ENOTFOUND` | Retried with user-approved network access; `/models` returned HTTP 200. |
| Initial planning-file update did not match a Markdown table separator | Inspected actual content and applied a narrower patch. |
| Initial three model candidates were listed but not callable under the account's free-tier allocation | Switched validation to the project's newer confirmed-free whitelist. |
| `qwen3.8-27b` remained ineligible during the newer-candidate sweep | Excluded it; retained seven HTTP-200 alternatives. |
| `glm-5.3` did not finish visible JSON within the 256-token functional budget | Excluded it from the primary trio; four other candidates passed the same contract. |
| REA filtered complete-bundle retrieval was rejected because filtered queries require summary detail | Switched to summary lookup and focused evidence operations instead of repeating the invalid request. |
| A multi-file planning patch failed context verification | Confirmed the patch was atomic/no-op, located the exact lines, and applied narrower patches. |
| First local `jq` query assumed the wrong REA export wrapper | Inspected top-level keys and corrected the path from `.result.records` to `.records`. |
| A second multi-file planning patch failed context verification | Confirmed the patch was atomic/no-op and switched to one-file patches. |
| REA rejected a controlled connection to the existing Chrome target with `target_not_allowed` | Did not retry; retain REA as passive observer and use a separately authorized reload trigger only if needed. |
| First static-bundle query assumed `observations` was an array | Inspected actual types; read categorized `routes`, `endpoints`, `chunks`, source maps, and WebMCP declarations by key. |

## Resources

- Reference product: <https://atoms.dev/zh>
- Existing evidence log: `/Users/jiaqizhong/atoms-reverse-engineering.md`
- Project root: `/Users/jiaqizhong/atoms-demo`

## 最小技术架构验证发现（2026-10-13）

- **观察：** Next.js 15.3.9 可在本机 3000 端口启动，`/api/health` 返回 HTTP 200。
- **观察：** `ai-news-radar/.env.local` 中的 API 凭证和 DashScope OpenAI-compatible 端点仍可达；旧默认模型已耗尽免费额度。
- **观察：** 在进程级覆盖模型为 `qwen3.8-flash` 后，真实模型请求返回“Atoms 模型链路正常”，HTTP 200，服务端耗时 1358 ms。
- **观察：** 预写 React + Vite 示例可完成生产构建，并能在 macOS `sandbox-exec` 独立进程中启动。
- **观察：** 不含 `allow-same-origin` 的 sandboxed iframe 会使 Vite 模块请求使用 opaque/null Origin；预览服务必须显式允许模块跨源加载。
- **观察：** 增加 CORS 响应头后，Chromium 成功在 iframe 内渲染 React 示例并完成按钮交互，没有页面错误。
- **限制：** 本机没有 Docker 或其他容器运行时，因此容器级隔离仍未被实测。
- **实现选择：** 当前沙盒入口只允许启动固定 Vite 命令，使用固定目录和环境变量白名单；这用于技术链路验证，不等同于可执行任意生成代码的生产安全沙盒。

## 核心 Coding Agent 实现发现（2026-10-13）

- 真实 `qwen3.8-flash` 已连续生成多个非预置主题项目，包括“海风书店夜读仪表盘”“星轨音乐节排班器”“潮汐呼吸练习室”和“极光种子实验室”。
- 成功流程会依次发送 SSE：任务建立、模型生成、源码完成、文件保存、受控构建、预览启动和完成；网络心跳保持长模型请求不中断。
- 每个任务目录为 0700，源码为 0600；生成文件合同限制路径、数量、单文件/总大小、导入源、动态执行和网络 API。
- 构建只运行平台固定的 TypeScript 与 Vite 命令；构建 profile 下读取模型凭证返回 `EPERM`，公网访问返回 `ENOTFOUND`。
- 沙盒限制包括 CPU 秒、文件大小、文件描述符、640 MB 进程树 RSS、最多 32 个任务进程、40 秒单命令墙钟超时和 15 分钟预览生命周期。
- 一次基础设施错误触发并观测了恰好两轮自动修复，第三次失败后正确终止；成功的最终端到端流程在第一次构建即完成。
- 最终 Playwright 测试从自然语言输入开始，验证完整 SSE 时间线、iframe 内容和生成应用内部状态交互，控制台无错误。

## 多轮修改实现发现（2026-10-13）

- 当前 `runGeneration` 无条件创建新 UUID，API 不接收 `projectId`，因此无法连续修改原项目。
- 当前 `writeGeneratedFiles` 会清空 `src/components` 和 `src/data` 后重写完整项目，不能满足“仅修改必要文件”；多轮链路需要独立的增量 patch 写入函数。
- 当前 `startPreview` 对同一项目再次启动时会覆盖注册表但不停止旧进程；成功重建后必须先终止该项目旧预览，再用同一个项目 ID 启动新产物。
- 当前前端提交时会清空时间线和结果；需要改成按轮次追加用户消息、SSE 事件与完成结果，同时保留旧 iframe 直至新版本构建成功。
- 最终采用“完整项目仅用于首次创建，后续模型返回 changed files + deleted files”的双合同；服务端将 patch 与磁盘当前版本合并后执行完整安全校验，再只写入实际变化文件。
- 项目状态保存于私有 `project-state.json`，成功源码保存在 `.atoms/versions/<version>/`，每轮构建日志保存在 `.atoms/runs/<turnId>/`；前端同一会话同时保留三轮用户消息、SSE 轨迹和 Agent 结果。
- 同项目预览更新必须在新 Vite 进程就绪后再停止旧进程；注册表清理还需要按子进程身份判断，避免旧进程的异步 exit 事件误删新预览。
- 修改连续失败时恢复上一成功源码并重新构建其 dist，可防止失败的 Vite 构建清空旧产物后留下不可用预览。
- 真实验收证明三次请求使用同一 UUID 且版本严格递增 1→2→3；v2/v3 的 SSE 都包含 `project_loaded`，表明修改前确实读取了原项目。

## 高保真界面复刻发现（2026-10-13）

- 首页参考图的 CSS 视口约 1200×703：导航高约 56，Hero 视觉中心略低于屏幕中线；公告、8 个叠放 Agent 头像、约 52 px 黑体标题、18 px 灰色副标题和约 720×126 的输入卡形成单轴层级。
- 首页背景接近 `#f7f7f7`，宿主主色接近 `#4468ff`；圆角导航/按钮和输入卡较多，但阴影非常轻，不能使用当前工程风格的深色侧栏或网格底纹。
- 工作区参考图的 CSS 视口约 1470×801：最左全局栏约 50 px，中间聊天栏约 450 px，右侧 Viewer 约 970 px；顶栏跨中栏和 Viewer，Viewer 占据绝对主导面积。
- 对话区使用自然语言段落、轻量工具步骤、浅灰用户气泡和浅蓝版本卡；版本卡比逐步日志更突出。运行时发送变成黑色停止方块，旧预览保留，发布为淡蓝禁用态。
- Viewer 自带浅色圆角宿主框和工具条，包含桌面/手机、刷新、Home、外链/控制台；生成应用画布与宿主栏明确分层。
- 窄屏宿主没有直接观察证据；按规格采用顶部栏 + “对话/预览”分段视图，核心功能不隐藏，所有主要触控目标至少 44 px。

## 上线闭环审计（2026-10-13）

### 用户已确认的上线定位

- 首版是面向少量真实用户的线上公开演示产品，预计实际用户为 1–2 人。
- 产品为非商业用途，首批用户位于中国大陆。
- 目标周期只要求覆盖 2026 年 10 月；优先免费或最低成本，但必须让用户能够正常在线体验。
- 该定位允许首版按低并发 Demo 设计：同一时间最多一个生成任务、最多两个账号、短沙盒空闲时间和严格生成额度。
- 如果 Demo 不收费且不代表商业组织使用，可先评估 Vercel Hobby；Cloudflare 容器仍需要 Workers Paid。Supabase 可先用 Free，但需接受低活跃暂停风险。
- 这是容量和成本选择，不降低不可信生成代码的隔离、鉴权、密钥保护和持久化要求。
- 大陆“正常体验”不能仅由低并发推出；仍需单独验证跨境网络可达性。若官方平台不提供大陆服务保证，必须将其列为风险或改用香港/大陆可控主机。

### 本地现状

- 当前目录仍不是 Git 仓库；无法建立正常的版本、CI/CD 和托管平台自动部署链路。
- GitHub CLI 中账号 `ZhongJiaqi` 仍显示为活动账号，但 Token 已失效，必须重新登录后才能创建或推送公开仓库。
- 本机已安装 Vercel CLI 52.0.0 和 Supabase CLI 2.90.0。
- 本机没有 Docker、Podman、Colima、Lima、Wrangler，也没有安装 `@cloudflare/sandbox`、`@supabase/supabase-js` 或 `@supabase/ssr`。
- 当前源码只有固定 Vite 示例和单次模型测试接口，没有自然语言到代码的生成合约、任务状态、构建队列、项目/版本表、用户认证或线上预览生命周期。

### 官方资料初步结论

- Vercel 官方明确说明：其在中国大陆没有基础设施或 CDN 节点，`.vercel.app` 域名可能被阻断或限速，即使绑定自定义域名也不能保证大陆地区的可用性或性能。因此，Vercel Hobby 只能作为零成本备选，不能承担“本月保证大陆用户正常体验”的主部署。
- Supabase 官方区域列表在亚太提供新加坡、东京、首尔等区域，但没有中国大陆区域；选择邻近区域只能降低地理延迟，不能构成中国大陆网络稳定性保证。
- Cloudflare 中国网络需要 Enterprise 计划的单独订阅和 ICP 备案，不符合本项目一个月免费演示的约束。
- 腾讯云官方当前列出的中国香港入门型轻量服务器约 38 元/月起，并明确提示普通香港入门型套餐不保障中国内地与香港之间的跨境公网质量。
- 用户已决定接受 Vercel 路线的可达性风险，以固定平台成本尽量为零和两位真实用户的实网验收为准。
- **实现推论：** 如果本月只生成受约束的纯前端 React/Vite 项目，可在服务端用固定配置完成静态编译，并只在无 `allow-same-origin` 的 sandboxed iframe 中执行产物；无需购买线上任意代码执行容器。
- Cloudflare 当前新版本的网页预览模式由 Worker 将请求转发到 Durable Object 容器；生成服务必须监听容器可达地址，生产预览需要明确的 URL/域名路由策略。
- Vercel 官方 CLI 支持项目关联、环境变量、预览部署和生产部署；本机 CLI 已具备，但账号登录状态与项目归属仍需确认。
- Supabase 官方 Next.js 指南使用 `@supabase/supabase-js` 与 `@supabase/ssr`；生产必须配置 RLS、安全策略和托管环境变量。免费项目可能因低活跃暂停，不适合作为必须稳定在线的最终演示保证。
- 外部资料的完整官方链接与限制由 `docs/DEPLOYMENT_RESEARCH.md` 汇总；所有外部说明仅作调研输入，不自动改变项目计划。

### Cloudflare 当前版本要点

- 当前 Sandboxes 文档的新应用路径以 Worker + Durable Object 容器为核心，不应照搬旧 0.x 的 `exposePort()` 示例。
- Worker 可以在 `workers.dev` 下通过 `/previews/<NAME>/` 转发容器页面，因此 MVP 不必先购买自定义域名；但 Vite 的根路径和热更新在路径前缀模式下有约束，正式体验更适合独立预览域名。
- 容器内预览服务必须监听 `0.0.0.0`；Worker 使用 `getTcpPort()` 转发。
- 当前示例默认可关闭容器外网（`enableInternet: false`），并建议为实例设置空闲超时和显式销毁接口。
- Cloudflare 本地容器开发明确需要 Docker-compatible CLI 与 Engine；Durable Object 调度策略至少需要 Wrangler 4.136.0，当前托管 Debian 镜像本地运行至少需要 4.141.0。
- Cloudflare Containers 没有免费容器额度；需要至少每月 5 美元的 Workers Paid 计划，另按容器内存、CPU、磁盘和 Worker/Durable Object 用量计费。
- 生产部署如果使用本地 Dockerfile，部署机也需要 Docker；使用已推送的注册表镜像或 Cloudflare Workers Builds 可减少本机部署依赖，但本地联调仍需要 Docker。
- Cloudflare 2026-09-30 的当前文档将 Containers 和 Dynamic Workers 作为两类沙盒；Container 是独立内核和网络的 microVM，并默认可关闭公网访问。
- Cloudflare 安全文档要求把 sandbox 视为最小信任单元：同一 sandbox 内进程和文件彼此可见，因此每个生成任务必须使用独立目录/实例，不能把不同用户或任务放在同一可读工作区。
- 密钥、模型凭证和宿主数据不得写入 sandbox；预览页面及其输出也必须按不可信输入处理。
- 当前机器没有 Docker，无法按 Cloudflare Sandbox SDK 要求进行本地容器开发；本轮只能对 macOS 本地沙盒适配器做真实 E2E，并保留生产沙盒替换点。

## Visual/Browser Findings

- Anonymous landing page: marketing navigation, login/register, prompt entry, product capability sections, pricing, FAQ, resources, and responsive hero.
- Login page: combined login/register, Google path, email path, disabled continue state, terms/privacy, redirect query, and product-value panel.
- Authenticated dashboard: sidebar/workspace, prompt composer, build-mode selector, credits, project area, discover/templates, and displayed third-party connectors.
- Current REA target discovery found an existing authenticated project page titled `Atoms - 个人主页生成器` at an `/zh/chat/{id}` route. This provides a no-new-credit observation target for the generated-project workspace. Evidence: `ev_8a6a16d2edb28f953b04962627ac475f0766a35475f2803c5613630eeb0030ce`.
- Passive inspection of that project page retained a complete page Evidence record with about 5,488 DOM nodes, but the client preview was truncated. The capture is policy-filtered for cross-origin content, and the generated preview iframe is not fully covered by an `atoms.dev`-only origin scope. Evidence: `ev_24a0b2007276e89039e9792679e9785180dcc3b176fe0a1f39e39fa16d7415e8`.
- REA session Evidence was exported to `/private/tmp/atoms-rea-evidence.json` for bounded local querying (5,331,757 bytes, 11 records, zero recorded unknowns). This is a temporary analysis artifact and must not be committed.
- The retained project-page record exposes separate accessibility, DOM, network, storage, resource, script, console, frame, metadata, and worker sections. Within the approved `atoms.dev` origin it retained one main frame, two resources, and no workers; excluded cross-origin frame/resource counts remain coverage limitations rather than evidence of absence.
- The project workspace accessibility tree contains 993 nodes. It explicitly exposes a `历史记录` button/tablist, establishing version/history access as a first-class workspace control. Evidence: `ev_24a0b2007276e89039e9792679e9785180dcc3b176fe0a1f39e39fa16d7415e8`.
- The generated-project workspace uses a three-column desktop composition: persistent product/project navigation, a conversational build timeline/composer, and a live App Viewer. The current 2940×1602 screenshot is complete for the visible viewport. Evidence: `ev_b594d9bb0135fd0ad4eb66d9ba7d2ba533c517b0cfe4fcff790cd7a3cc02bd15`.
- The build timeline exposes tool-level progress rather than only a spinner: reading files (`README.md`, `App.tsx`, `tailwind.config.ts`), writing files (`DESIGN.md`, `ThemeTabs.tsx`, `index.css`, `profile.ts`), terminal execution, quality validation, and visual inspection. The observed run finished after 13 steps.
- The App Viewer exposes desktop/mobile viewport switching, reload, a `Home` route selector, open-in-new-tab, and a console drawer. Workspace-level `分享` and `发布` are distinct actions.
- The observed project has a `版本` tab with `版本 1`; version history is visible but multi-version behavior is not yet observed.
- The workspace also exposes element selection and text modification controls, but these belong to the visual-editing capability explicitly excluded from Atoms Demo scope.
- The generated personal-homepage app is interactive in the viewer and includes copy-code/download-HTML actions. Its own completion message describes it as frontend-first and offers object storage/cloud persistence as a possible follow-up, so this example does not establish arbitrary generated backend execution.
- A completion-sound prompt and a PostHog survey overlay are ancillary product UI, not core generation-loop requirements.
- The passive attach window observed zero new HTTP requests and zero WebSockets, while explicitly reporting that prior activity was unavailable. This does not establish that the workspace is network-free; a reload or controlled navigation is required to observe hydration/API traffic.
- `atoms.dev` storage usage was about 26 KB with no IndexedDB databases and no Cache Storage entries. Local/session key names indicate UI/session state, App Viewer analytics/clock, message expansion, `chat_state_data`, and SSE queue bookkeeping. Because values are redacted and project content is not evidenced in IndexedDB, server-side project persistence is a strong inference, not yet a direct observation.
- The exported session contains both authenticated-dashboard and anonymous-homepage `analyze_web_bundle` records, so static endpoint/inference analysis can continue without repeating live captures or widening runtime permissions.
- The authenticated dashboard bundle analysis was complete only for seven admitted scripts. Its 23 endpoint candidates are predominantly analytics/getter strings and it recovered zero application routes, so it does not establish Atoms business API contracts. Evidence: `ev_c650c651e50f3fdcc7433ada19cb145ca45e36a4095b285b3b131a0738a988cd`.
- On the current project page, origin filtering admitted only two resources and three scripts while excluding 522 resources and 429 scripts from disallowed origins. Business API and generated-app runtime behavior therefore remain partially unobserved; negative claims are not justified.
- The project page has one excluded disallowed-origin frame plus one unsupported-URL frame, while the screenshot visibly embeds the generated application. Together these support—but do not fully prove—the inference that App Viewer isolates generated output in a cross-origin/opaque iframe. Atoms Demo should intentionally use a sandboxed separate-origin or `srcdoc` iframe boundary.
- A later target listing confirmed the same authenticated `个人主页生成器` project remained open under the same target ID, allowing continued observation without launching or creating another project. Evidence: `ev_cbd0b2b14312884b6b5c55a5de3ca15dc23e4481da5c9a8c602d49eceb9de6e0`.
- Continuation-session target discovery again found the same authenticated `个人主页生成器` project at the same `/zh/chat/{id}` URL and target ID, with no disallowed page origins in the two-origin listing. Evidence: `ev_2a8005c6abb9b4c3b7f328af6691ff6aad4594beb1ecadabd9ca7041ce1db84d`.
- The continuation-session REA in-memory ledger began fresh and contained only that new target-list record; prior records therefore need to be read from the exported portable bundle or replaced only by narrowly scoped new observations. This is a session-retention fact, not loss of the exported evidence file.
- The portable export `/private/tmp/atoms-rea-evidence.json` still exists (about 5.1 MiB) with all 11 prior records: two bundle analyses, one controlled scenario, two screenshots, three page inspections, and three target listings.
- A new passive page inspection admitted both `atoms.dev` and `public-frontend-cos.metadl.com` and retained 68 resources plus one worker, a material coverage improvement over the earlier two-resource capture. During this attach window, however, the main frame was observed at `https://atoms.dev/zh/my-projects` even though target discovery immediately beforehand selected the `/zh/chat/{id}` target. REA did not navigate; the cause and timing of that page-state change are unknown. Evidence: `ev_5acecf15c66fe8c530301418ca2b1cb8ac78d69574d221cc90c72d0ded5d9f4e`.
- A subsequent target listing confirmed the browser is now stably on `https://atoms.dev/zh/my-projects` with title `我的项目 - Atoms`. This is an observed state only; no navigation is attributed to REA. Evidence: `ev_3359238cfa63c68a1c8e1a8b2929fbe66c43863f8456497dc98b2579709300e1`.

## 本地高保真复刻验证

- 首页在 1200×703 下的 Hero、公告胶囊、头像栈、标题、说明文字和 760px 输入卡与参考截图的主结构一致；390×844 时导航自动隐藏次级链接，Hero 与输入卡改为单列且没有横向溢出。
- 工作区在 1470×801 下采用约 54px 全局栏、446px 对话栏和剩余 Viewer 的比例，与参考截图的主分栏相符。
- 运行态保留上一稳定 iframe，并叠加“正在构建新版本”提示；本轮失败时对话显示错误且不会清空已有预览。
- Code 标签的数据来自受 UUID 和项目路径校验保护的只读接口；实测文件列表为 `src/App.tsx`、`src/styles.css`，源码内容与生成项目一致。
- 真实两轮测试中，首次生成写入两个文件，后续深蓝主题修改只改变 `src/styles.css`；说明增量修改链路没有退化为重新创建项目。
- 移动工作区使用“对话 / 预览 / 代码”底部分段视图，同一时刻只显示主要内容面板，390px 视口的 `scrollWidth` 与 `clientWidth` 均为 390。

## 三个代表性用例端到端验收

- 三个用例都通过真实模型、SSE、首次受控构建、真实预览地址和项目接口持久化；对应项目分别为任务管理 `66da2baa-3e68-4d7e-a76f-facd7980d5ee`、个人记账 `c4be9a19-5600-445b-a5b4-18c30be2298d`、习惯打卡 `7534e66a-8aa6-45df-9c22-7fd2c249f230`。
- 任务管理生成代码在初始化阶段直接读取 `localStorage`。由于预览 iframe 为不含 `allow-same-origin` 的 opaque origin，读取抛出 `SecurityError` 且没有捕获，页面为空；核心交互和数据持久化均失败。
- 个人记账生成代码捕获了 `localStorage` 异常，因此应用可以渲染；但模型把要求的 `add-expense` 写成 `add-expense-btn`，没有遵循明确测试契约，本轮自动化在添加入口断言处失败。源码中的存储写入异常被静默忽略，即使修正选择器也不能通过刷新持久化。
- 习惯打卡的创建、打卡、进度和删除均在真实 iframe 中通过；代码同样捕获并忽略 `localStorage` 读写异常，因此刷新后新增习惯消失，数据持久化失败。
- 当前“项目持久化”和“生成应用数据持久化”是两条不同能力：前者三例全部通过，后者三例全部不通过。根因是安全设计禁止 `allow-same-origin`，但生成合同仍允许/鼓励直接使用 `localStorage`，两者尚未通过安全存储桥接或独立预览 Origin 协调。
- 项目级固化套件的第二轮正式运行再次证明：任务管理和个人记账的新增、更新/统计、删除可在当前 iframe 中工作，但刷新 iframe 后测试数据消失；这排除了“只是临时脚本选择器错误”的解释。
- 习惯打卡在不同真实生成轮次中表现不一致：一次因捕获 `localStorage` 异常而可交互但无法持久化，另一次仅捕获读取异常、未捕获写入异常，导致 React effect 抛错并使页面空白。持久化边界同时影响可靠性和一致性。
- 固化测试使用明确 `data-testid` 合同。若模型偏离合同（例如曾将 `add-expense` 生成成 `add-expense-btn`），测试会将其判定为生成质量失败；这能防止自动化通过模糊选择器掩盖模型未遵循需求。

## 指定 Atoms 项目页功能缺口复核

- 用户确认本月只实现第一层持久化：项目源码、消息、执行记录、版本元数据和可恢复预览；生成应用内部任务、账目、打卡数据不要求跨刷新保存。该决定取代此前“业务数据刷新持久化是发布阻塞”的结论。
- REA 当前重新发现两个已登录且都停留在指定项目地址的页面目标。Evidence：`ev_d40b782953e045ebee0d31f3e03001d7115c3a4bbdcb399385a450bbc3ac31a6`。
- REA 被动页面检查直接观察到历史记录、v1/v2 标题和时间、恢复入口、恢复到此版本、克隆、分享、发布、移动预览、新标签页、控制台，以及选择元素/修改文本/主题设计工具。Evidence：`ev_baf71f606ce64d77bb1b3d5c06bb4f85a96bb8acd7f6865b529927343685bfc2`。
- 当前可见视口截图确认目标项目、两轮 Agent 结果和真实成品预览同时恢复在同一工作区。Evidence：`ev_ee4ca816584c096c69616cfc8394579f6917773d8430f2cb0eac96577a51d201`。
- 当前 Demo 已具备真实生成、SSE、同项目增量修改、源码 API、本地消息/执行记录和版本快照；但页面刷新会回首页，历史/恢复按钮无行为，分享/发布、停止、跟随、项目导航和控制台仍是占位或部分实现。
- 当前 `generated-projects/` 本地目录和进程内 Vite 预览不能满足 Vercel 冷启动与持久化要求。第一层持久化的 P0 缺口收敛为：云端项目存储、稳定项目 URL 恢复、静态预览产物恢复、版本历史与恢复。
- 目标页按钮点击后的具体语义没有验证；REA 不保留认证值或网络正文，因此不推断 Atoms 的后端存储技术。

## 双层持久化口径补充

- 用户追加要求：宿主页刷新后不仅项目 API 数据一致，界面也必须恢复同一项目及其最新成功版本；第二层生成应用数据也尽量对齐真实 Atoms 页面能力。
- 单独归因的 Playwright/CDP 只读检查发现，目标成品运行于 `https://…app.atoms.dev` 独立 Origin；该 frame 的 `localStorage` 可用，当时有 2 个非业务键，IndexedDB 数据库数量为 0。
- 可恢复实验把 `#op-name` 临时改为随机标记并点击“重新加载应用查看器”；重载后两个目标页面都显示原始值“林雨言”，说明当前目标应用没有把该表单字段写入持久存储。实验中间脚本因 iframe 重挂载时序提前结束，随后恢复脚本确认两个页面都没有残留测试标记。
- 以上只能证明 Atoms 提供独立、可使用浏览器存储的预览 Origin，不能证明平台自动保存所有生成应用业务数据。应用是否持久化仍取决于生成代码或平台 Runtime。
- 新验收选择“能力对齐 + 明确需求”：三个代表性需求明确要求刷新保留数据，因此 Viewer 刷新和宿主页刷新后都必须保留记录与状态；测试不强制使用 `localStorage`。
- 当前 Demo 的 `/api/preview/...` 是主站同源代理且 iframe 不含 `allow-same-origin`，所以新增断言在实现独立预览 Origin 或安全存储桥前预期失败；不能通过直接增加同源权限规避隔离。

