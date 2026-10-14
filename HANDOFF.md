# Atoms Demo 项目交接文档

更新时间：2026-10-14（Asia/Shanghai）

## 最新增量：历史记录重设计与云基础真实验收

- 用户明确拒绝大号 v1 占位封面和重复版本号：现已移除左侧图标块，只在标题旁显示一次小型 vN 标签；项目名为标题、变更摘要两行截断、时间和恢复操作位于 footer。当前版本采用细蓝色边线/状态点，底部恢复说明独立于滚动列表。保持原恢复处理、禁用条件、44px触控、focus trap/Esc及减弱动效，不新增假截图或图片构建请求。
- frontend-design 技能遵循已有冷灰/蓝色系统；测试先复现标题被摘要替代，再复现版本图块46px超限，修改后通过。最终build成功，默认unit扩展为61/61通过；完整Playwright27通过/5跳过/0失败（约1.1分钟），含真实模型、DB、本地沙盒恢复及同项目回滚继续修改。UI契约用例不是云端验收。桌面1440和320/375px截图已实际查看；正常用例无非预期console/network错误。5项仍缺专用邮箱配置，不可声称全部通过。
- 最新本地服务会话80542，http://127.0.0.1:3010，绑定0.0.0.0。独立UI复审无Critical/Important，删除了此次改动产生的孤儿.history-version-icon样式。
- 用户要求并行：root负责UI及统一build/浏览器验收；cloud_agent_integration负责云Agent runtime；cloud_foundation_validation负责DB真实验收；history_ui_review先独立复核，后限定实现预览grant/domain基础模块。各任务不得同时写app/page.tsx或运行共享.next构建。
- 独立Atoms ref jvnweimexkigooqvagfz 已正式应用202610140001_cloud_artifacts.sql和forward202610140002_cloud_conflict_errors.sql。首次真实RED不是通过：无租约保存发生90秒超时，15秒请求截止重现；自定义40001触发PostgREST无限重试。依据Supabase官方故障指南，forward只将云租约/云版本冲突转PT409（409），保留原本地RPC、事务/行锁/权限/空search_path，不修改已部署迁移、不删除已有数据。官方依据：https://supabase.com/docs/guides/troubleshooting/high-cpu-and-infinite-transaction-retries-when-using-custom-error-codes-in-rpc-functions-77326b
- 云基础最终真实DB测试1/1通过（10.515秒）：私有5MiB bucket、签名读取、跨账号拒绝、并发租约唯一胜者、真实v1文件/消息/run、过期/旧令牌/释放后/旧基线拒绝且五表无变化。临时产物/项目/两个账号均清理。独立SQL/测试复审无Critical/Important；这是基础验收，不等于线上产品可用。
- 新增runCloudGeneration保持原模型及两轮修复，通过/tmp独立任务目录、DB hydrate、真实云build、私有artifact与fenced快照保存；helper未接HTTP，previewReady:false且无伪造URL。33个云相关单元和原28个默认单元现统一纳入npm run test:unit（61项）；deadline迟到结果测试经过删除guard RED再恢复GREEN。真实整链测试和预览gateway仍在进行，不能宣称部署完成。
- 云链仍有明确未完成：私有产物preview gateway及稳定独立origin接入、失败任务持久化、统一DB snapshot读取、孤儿产物回收、云封面、线上真实浏览器验收及大陆网络。正式部署仍要单独确认；尚未发布生产。

## 最新运维状态：用户已配置预览管理 Token

- 用户提供的 Dashboard 截图明确显示项目范围选择，包含 atoms-demo；用户随后按指导创建并保存 Token。没有在聊天中传递密钥。
- 2026-10-14 只读 CLI 核验确认 ATOMS_VERCEL_API_TOKEN 有两条独立配置：production/sensitive 和 preview/sensitive，均未限定 gitBranch。检查仅输出名称、类型及目标环境，未读取或展示密钥值。
- 当前只验证了变量存在和 Sensitive 类型，没有实测该 Token 的项目权限、到期日期或地址绑定能力；这些不能宣称通过。未覆盖本地环境文件，未部署或升级套餐。

## 前序记录：CLI 创建 Token 被平台拒绝

- 用户明确同意创建仅限 Atoms 项目、30 天有效的 Vercel 管理 Token，并仅在服务端加密保存；正式部署仍须单独确认。
- 已重新核验 Vercel 链接：项目 atoms-demo，ID prj_Qy0ugq79jGkv9gAGc1vVeNtMpdkm，团队 jiaqis-projects-c666d1ab，Node 24.x。主站 atoms-demo-jiaqi.vercel.app 已绑定，尚无正式部署。
- CLI 登录凭据调用 POST /v3/user/tokens（指定 projectId/expiresAt）失败：403 `Cannot create tokens for this app.`；只读 tokens ls 未发现本次命名的新增 Token。未取得或注入密钥，未覆盖任何环境变量，未改用全账户或团队 Token。
- 官方 REST API 文档列出 projectId，但 Dashboard 创建指南只明确团队范围，实际项目限定权限尚未验证。需要用户网页授权/人工创建，或改为不依赖运行时管理 Token 的预览地址方案；不得把文档字段当成权限实测通过。
- 已完成云 Sandbox 真实 SDK 构建测试；新增云存储/租约迁移 dry-run 仅显示 202610140001_cloud_artifacts.sql，尚未正式应用。云 Agent 链路、持久预览及线上验收仍未完成，不能宣称上线可用。

## 最新授权：公开GitHub与云端SDK

- 用户明确要求创建公开（不是private）ZhongJiaqi/atoms-demo仓库并推送main，允许新增@vercel/sandbox及锁文件更新。尚未批准生产部署；云端环境变量同步和新服务配置仍需确认。
- 已安装固定@vercel/sandbox 3.8.0，仅新增41个传递依赖，原包未升级；npm报告3项既有风险（1moderate/2high），不运行audit fix --force。未改.env。
- 公开历史审查：未跟踪env.local、generated-projects、trace或截图。gitleaks扫描6提交唯一命中findings.md:263；安全检查确认是ev_+64位SHA256调查证据ID，不是凭据。新增.gitleaksignore仅精确忽略该旧提交fingerprint，再扫0命中，禁止宽泛跳过整文件/规则。新增忽略.vercel目录，避免后续误提交平台本地配置。
- 云端最小适配需短时VM构建/截图、私有持久产物、每次从DB恢复修改基线、跨实例项目租约、稳定独立项目preview Origin及签名授权。不能仅装SDK就宣称云端生成可用。
- 安装后验证28单元、生产build/typecheck、完整Playwright26通过/5跳过/0失败（约1.1分钟）；5项仍缺专用邮箱测试账号。独立依赖审查无Critical/Important，文档过时Minor已更正。新增undici要求Node>=20.18.1，部署使用Node22或24；不在本轮自动改用户环境。
- 当前本地服务执行会话11075，http://127.0.0.1:3010。已创建PUBLIC仓库 https://github.com/ZhongJiaqi/atoms-demo，origin同URL加.git；main首次推送67f75ed96d1ef29abddc844a924f0e0a078ecd0c，git ls-remote与本地HEAD一致，已设置upstream。生产云资源创建/配置仍等待确认，不重复创建仓库。

## 初始上线检查（授权结论已被上方公开仓库确认替代）

- 用户要求先推进推送/部署，但上一条明确“推送、部署之前都要确认”仍保留；尚未创建远端仓库、push、Vercel项目或部署。
- 2026-10-14只读CLI：GitHub已登录ZhongJiaqi，本项目git remote为空，gh repo view ZhongJiaqi/atoms-demo返回不存在/不可访问。Vercel whoami意外自动触发device登录，随后实际登录成功；用户名603820870-9757，团队jiaqis-projects-c666d1ab（Jiaqi's projects）。旧文档的Token失效/未登录结论已过时，不要重复要求GitHub重新登录。
- 线上生成仍阻塞于本地macOS sandbox-exec、磁盘目录和进程内注册表；直接部署只能提供不完整体验。已完整读取deployment-patterns/vercel-cli/vercel-sandbox技能并核对官方Sandbox费用页；Hobby额度内免费，超额暂停，不自动升级付费。
- 初始曾建议private仓库及请求SDK授权，随后用户明确改为公开仓库并批准SDK，以上方最新授权为准。生产部署和Atoms专用云环境同步仍须后续明确确认，禁止影响ai-news-radar。
- 人读上线准备说明：docs/DEPLOYMENT_START.html。未修改env/lock，未实现远程adapter，不把文档当上线完成。

## 最新增量：首页需求示例与顶部吸附修复

- 首页输入框下新增项目看板、个人记账、个人主页、习惯打卡四个示例。点击只填写完整需求并focus(preventScroll)，不自动发送；可继续编辑/切换，匹配原文本时显示选中态。44px触控按钮、flex-wrap适配窄屏。未增加赛马/附件等未实现入口。
- 用户报告滚到顶部自动下移。实际Chromium诊断记录initial/top scrollY=76、hero.offsetTop=76；首个scroll-snap-align错误在导航栏下的hero。改为landing-nav（页面0），保留下方三段吸附。最初测试瞬间经过0误判通过，改稳定采样后正确RED[76,76,76,76]，修复后GREEN[0,0,0,0]。
- home-examples.spec.ts先缺按钮RED，再验证桌面1440、375、320px完整文本/焦点/选中态/编辑切换、开始可用、无自动生成请求/横向溢出、0console/network错误。桌面/320截图已实际查看。未改Agent、数据库、env、锁文件；用户指定Prompt模板路径仍不存在，未调整模型Prompt/调用策略。
- 用户2026-10-14明确：本地功能验收完成后才考虑推GitHub与部署；推送前、部署前必须分别征得确认。尚未push/deploy，git remote -v为空；不得自行新建远端仓库或发布。原始5项缺专用邮箱账号的测试仍不算验收完成，线上macOS沙盒不兼容问题仍待解决。
- 当前服务执行会话90939，http://127.0.0.1:3010。最终28单元、build/typecheck通过；完整Playwright26通过/5跳过/0失败（约1.2分钟），包含既有真实模型/数据库/沙盒恢复/回滚；5项跳过原因未变。独立本轮只读审查无Critical/Important/Minor发现。

## 最新增量：并行首页介绍、工作区控件与预览自动恢复

- 主Agent负责预览恢复和统一build/Playwright，workspace_controls_polish负责限定工作区组件，home_product_sections负责限定LandingPage；独立preview_workspace_review只读审查。不要同时启动多个Playwright命令或共享.next的dev/build。
- 新增授权 GET /api/projects/[projectId]/preview-status，仅返回active/expiresAt/currentVersion，验证登录和项目RLS。useProjectPreview在进入、到期、每30秒可见检查、focus/visibilitychange自动检测；预览失效POST已有resume，保留projectId，失败提供真实错误与重试，不调用模型。
- resume按同项目singleflight去重；先获得现有全局写锁再读取源码快照，读取/写文件/build全在锁内；Promise共享完整runtime响应。该锁仍是单实例内存锁，不是线上分布式锁。
- 检测其他标签新版本时复用restoreWorkspace同步完整源码/对话/版本，而非无限要求手动刷新。恢复时暂停提交、回滚与新建入口。Agent写文件期间暂停检查，保持现有模型策略。
- 工作区用统一SVG替换占位符号，复制回复使用真实剪贴板并反馈失败；版本记录真实入口，执行日志展示最近一轮事件，手机打开历史项目切回可见对话。移除无实际作用的下拉/假停止按钮。
- 首页新增三段产品介绍在原需求框与我的项目之后，宽高充足桌面原生轻吸附分段，窄屏/短屏自然单列；reduced-motion关闭吸附/平滑滚动。插图明确示意，无虚构用户数/商业能力/分享发布。公开atoms.dev文本已参考；官网实际滚轮/动画因浏览器入口不可用未直接观察，设计不冒称已完整逆向。docs/HOME_PRODUCT_SECTIONS.html记录边界。
- RED：工作区5项、预览原2项和首页3项正确失败；多标签同步新增断言先失败后修复。首次GREEN回归卡在iframe中文按钮，trace明确HTML测试响应未声明UTF-8导致乱码；只修正测试fixture的charset，随后通过。
- 最终验证：28单元、build/typecheck通过，完整Playwright 24通过/5跳过/0失败（58.8秒）。跳过原始Phase2两项及代表应用三项，缺E2E_PRIMARY/OTHER专用邮箱测试账号；不能写全部29项通过。真实DB回滚用例先终止精确匹配本用例UUID目录的Vite，随后并发resume和浏览器focus自动恢复，确认同projectId/v2、单一新进程、iframe计数可操作且DB仍仅v1/v2；后续真实模型修改/回滚/刷新/跨账号隔离继续通过。独立静态初审两项Important均已修复并复核无剩余发现；不把静态审查当真实测试。恢复失败契约样本验证真实错误/可重试；按钮24px不足先RED，补44px后GREEN。该受控500是预期失败，正常监控操作无非预期console/network错误。桌面/375px首页和工作区截图已实际查看，无明显溢出或遮挡。
- 当前最新生产体验服务：http://127.0.0.1:3010，执行会话49741。未改env/lock/模型，无数据库迁移，真实用户项目未动；测试只清理自己创建的账号/项目/目录。
- 仍未完成：远程沙盒/线上部署/预览签名/分布式锁、原始邮件注册与三个代表性应用全套验收。别把本轮独立临时账户回滚测试当成所有旧用例通过。

## 最新增量：全宿主 UI 优化与首页项目封面

- 2026-10-14 追加需求：首页卡片移除详细描述，仅保留应用主页封面、项目名称与最近更新时间。仅改首页JSX与其孤儿CSS，不改聊天/历史摘要或数据库。新增真实卡片无描述断言已先失败（存在1个描述段落）；修改后28单元、build/typecheck、12项Playwright全部通过（44.6秒），正常操作无非预期console/network错误。服务执行会话更新为7629。

- 使用 frontend-design、redesign-existing-projects、adapt、animate，基于原 UI 增量统一冷灰底色/单蓝强调/系统字体/间距/圆角/轻量动效，无新增 UI 库，无 Agent 模型策略改动。
- 首页“我的项目”只有成功项目（current_version>0），一个项目一张卡，不显示版本列表/查看历史项目。草稿仍保存在数据库，不删除用户数据。单测已先复现再验证修复，真实 DB 用例会创建一个草稿并断言首页仍只有一张成功卡片。
- 首页封面从 live iframe 改成真实 PNG：新增私有 GET /api/projects/[projectId]/thumbnail?version=N，验证会话/所有权/版本，读取不可变版本源码，在自己的 thumbnail-UUID 临时目录构建/启动，干净 Chromium 截图后关闭浏览器/Vite、回收临时目录。缓存位于 generated-projects/.thumbnails，不代替数据库永久代码。
- 截图任务去重/串行，队列容量6；网络只允许本次随机 loopback 沙盒，无用户 Cookie/应用 storage。截图失败显示真实封面错误但项目链接仍可打开。普通与新标签点击都是原项目最新版本的恢复链接，不在首页提前 resume。
- 保留手机历史版本/登录/控制台；核心控件44px、输入16px、聊天文字换行、预览适配短横屏。图标 tooltip 同时支持 hover 与键盘 focus；普通文字按钮不重复弹提示。版本面板支持初始焦点、Tab循环、Esc、返回焦点。
- 新增 Enter 发送、Shift+Enter 换行与 IME 保护。动画仅轻位移/透明度与真实状态反馈，尊重 reduced-motion（包括滚动）。移除假附件/折叠/发布入口，分享发布按用户要求暂缓。
- 最终验证：28/28单元、生产build/typecheck、12/12 Playwright通过（45.2秒）。真实DB/模型/沙盒、回滚、PNG版本区别、截图目录清理、同浏览器退出A并登录B后的图片404拒绝均通过；正常操作0非预期console error/4xx/5xx。无效登录400、未登录401、越权404、冲突409及网络阻断为明确预期测试。第一轮10 Playwright通过；随后同浏览器换账号测试发现退出303跳向0.0.0.0，曾10通过/1超时；已先复现303再改退出API为JSON结果，前端仅成功后跳首页、失败展示反馈，最终回归通过。
- 复审修正：图片private,no-store避免跨账号浏览器缓存；服务器缓存32MiB上限按最旧PNG清理，临时文件rename原子写；浏览器上下文阻断所有WebSocket、禁WebRTC/ServiceWorker/背景网络，HTTP仅随机origin的GET。新增真实网络守卫测试和缓存单测先RED后GREEN。该浏览器层守卫不是OS网络隔离证明。320px按钮固定不收缩/不换行；恢复焦点trap生命周期只随面板打开，读取恢复状态ref，恢复中聚焦panel。
- 运行依赖：2026-10-14 用户明确允许后，已把playwright 1.64.0声明为直接正式依赖；锁文件只新增根依赖、移除playwright/playwright-core的devOptional标记，无其他包版本变动。离线package-lock-only因无关可选包缓存缺失失败，随后用最小补丁更新；npm ci --omit=dev --ignore-scripts --dry-run --offline与npm ls --omit=dev均通过（仅模拟生产安装，不冒称全新环境实际安装）。生产build、28单元及相关4项浏览器回归通过，未改环境变量。next.config.ts外置playwright。线上仍必须提供Chromium运行时/隔离adapter，现阶段是本地macOS沙盒架构；截图浏览器暂未纳入Vite RSS监控，不宣称部署完成。独立初审已完成，最终独立复核因代理额度限制失败，不能写最终独立review通过。
- 设计报告：docs/UI_POLISH.html（中文单文件HTML）。响应式测试使用 Chromium viewport 与有效 CSS viewport 模拟桌面缩放，不冒称真实手机或原生浏览器zoom/多浏览器已测试。
- 本轮不改 .env/锁文件，不操作 ai-news-radar，不删除原用户数据。关键改动：app/page.tsx、app/globals.css、listUserProjects、thumbnail route/queue、next.config.ts、package.json test:unit、新增 responsive-design/project-thumbnail/thumbnail-queue 回归及扩充真实 rollback 用例。
- 当前生产体验服务：http://127.0.0.1:3010（监听0.0.0.0:3010，执行会话7629）。测试结束已删除仅由本测试新建的两个临时账号及项目/目录/截图缓存；你的真实数据未动。浏览器网络trace含临时会话信息，勿公开上传。

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
