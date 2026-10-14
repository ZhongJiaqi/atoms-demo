# Atoms Demo 项目交接文档

更新时间：2026-10-14（Asia/Shanghai）

## 当前测试执行策略（用户最新指令，后续会话必须遵守）

- 采用增量验证，禁止每次修改后自动运行全量套件。开发中优先受影响文件/组件/模块测试；纯UI样式或文案只做相关页面检查与必要回归。
- 功能完成执行相关单元及必要集成；认证、数据库结构、公共接口等高风险扩大覆盖。全量测试、完整构建、完整E2E原则上安排里程碑/最终交付，提前运行须有高风险理由。
- 已有失败先定位根因，不反复跑整套碰运气。安全检查、真实核心验证仍必需。每次交付准确报告已运行、未运行与残留风险；此规则覆盖旧Skill默认每改一处都全量验证的频率要求，不免除TDD先RED→GREEN。

## 正式部署与线上验收进行中（以下旧记录为历史，不代表当前状态）

- 品牌导航正式已发布：用户授权普通push ee48a04→249d621成功；部署dpl_APQjF6nXZt8SCuKAWHz1yKWhnnb5 READY，146源文件，主站atoms-demo-jiaqi.vercel.app。发布后仅受影响brand-home-navigation.spec线上7/7通过（15.8s），无console/pageerror与>=400响应；名称/首页与登录注册/桌面1470+320/375/Click与Enter/生成期拦截均通过。UI合同样本不替代真实模型，UI版本未重复跑真实Agent全链路或全量E2E；上一正式核心Phase2和三应用分轮通过记录仍可参考，未改核心API/Auth/数据库。用户新版AGENTS.md整体替换旧指令并已包含增量策略，后续以新版为准，不覆盖其文件。恢复期单独交互/真实手机与大陆网络/SMTP邮箱确认仍待验收。
- 用户新增品牌导航：首页及登录/注册可见品牌统一Atoms Demo；工作区compactlogo标准a href'/'支持Click/Enter返回真实首页、hover/focus提示、44px触控。生成或preview恢复中aria-disabled+preventDefault沿现有newProject门禁，避免误中断SSE；不clear存储、不删除项目/调用新generate。frontend-design保持原冷灰蓝布局，仅必要auto/nowrap/mobilelogo宽度。旧UI RED6cases+login1case，修改后root新build79757通过、production3010 session16464；品牌7+authnav4+workspace5 Playwright16/16通过，品牌所有case有0console/0>=400断言。root108/108unit、typecheck/build通过，桌面1470/手机320截图实际查看无品牌截断溢出，独立review Critical/Important0，恢复期单独test未覆盖属Minor。仅UI合同API/SSE fixture，不冒充真实模型/DB测试。正准备发布这两项UI，尚未上线新品牌；Agent/Auth/模型/env/lock未改。
- 记账测试固化与结果报告已追加提交ee48a04并普通push成功25e0fda→ee48a04。原两commitbackup仍保留本地，Google暂缓文件仍untracked本地/部署排除，不删用户资料。
- 最新：真实Expense复验63759完整passed1/failed0/skipped0/flaky0，temporaryUsers2/cleanupFailures0。录入/总额88.50/删除、iframe刷新及整页刷新数据保留、DB项目/最新version/messages/turns/files一致、console错误断言通过。三个代表case已分两轮全部取得通过结果（之前Task/Habit2pass+Expensefail，本次Expense1pass）；不伪称同一批3/3。expenseTotal仅测试定位器，优先testID，缺失时精确“总支出”标签parent，先strict标签拒重复并拒BODY/HTML/null避免读取其他区域金额。TDD两轮RED→GREEN，root fresh静态6/6+typecheck0，独立review Important1关闭。未改生产Agent/Prompt/模型策略或环境。
- 用户允许整理后已保留backup/local-pre-push-20261014，原两未公开commit以ea63edb为父整理为25e0fda；假PAT改运行时synthetic构造，gitleaks全5commit0。git普通push已成功4c8843a→25e0fda，无force/无bypass，远端GitHub核心云代码已同步。新增定位器及本次验收报告待追加测试commit。
- 公开新用户邮箱确认仍需SMTP（确认不关闭）；仅只读ai-news-radar/.env.local变量名未发现SMTP/Resend/Brevo等配置，无值输出/修改。已异步询问用户已有邮箱/发信服务名称，不在聊天索密钥。下一步由服务类型提供具体步骤/安全配置及实际注册收信验证。Google依旧暂缓，未启用；真实PNG/失败任务持久化/统一读取snapshot/孤儿GC/大陆真机网络尚未完成。
- 用户已明确允许“整理并推送”：本地backup/local-pre-push-20261014已保留原56396b4及e1a241b历史；计划仅合并这两条未公开commit并移除假PAT，父commit仍ea63edb（沿已有远端main正常fastforward），不force、不改已公开历史。真实记账语义定位回归并行进行，尚未重跑记账。
- 正式代表应用55835结果2通过/1失败，临时用户2/清理失败0：任务管理、习惯打卡通过；个人记账添加条目通过后缺expense-total测试标识，30s locator断言失败，删除/刷新后续未执行。实际失败PNG可见总支出¥88.50；仅读取本次临时项目API响应源码确认Summary reduce+toFixed正确且未加testID。准备语义“总支出”标签定位兼容，金额/删除/刷新断言保持，不改Agent或Prompt，不把定位失败冒称功能已完整验收。
- 用户已批准推送云代码；实际git push被GitHub GH013阻止（远端未更新）：e1a241b/56396b4测试文件内手写假PAT符合格式，非真实凭据。gitleaks六commit扫描0但GitHub模式更严格；fixture已改运行时构造synthetic值，helper6/6通过。已再请求允许保留本地backup并整理未推送两commit再push，待答复，不绕过保护/不force/不改remotehistory。当前本地main56396b4，远端main仍4c8843a，未提交fixture修正和报告增量。
- 最新真实正式Phase2会话32869已完整通过：passed1/failed0/skipped0/flaky0，临时用户2/cleanupFailures0。使用真实模型、VercelSandbox、DB和privateartifact；Todo v1真实添加/刷新保留、深色v2/页面刷新同项目及chat2、退出重登卡片恢复、第二账号GET/修改403或404拒绝、原账号再恢复v2→优先级v3同项目/chat3，正常浏览器console/network断言均通过。此用例不包含真实邮件注册和主题按钮/优先级按钮额外功能断言，不扩张验收结论。开始三个代表应用正式验收，尚未有结果。
- 本轮正式发布dpl_8u49EVVJXcrQaZbqg2SStB4wyJQi已READY（143源文件、云端Next15.5.27构建/typecheck通过），已包含旧本地项目thumbnail修复。主站仍atoms-demo-jiaqi.vercel.app。根因transport回归1/1通过后，真实Phase2待runner脱敏复审通过再继续；不提前写功能全过。
- runner脱敏复审发现quoted chunk/双序列化JSON/header数组遗漏，已采用最小failclosed整条省略而非扩充序列化解析器；synthetic先RED→GREEN，独立复审Important1关闭。root fresh108/108+typecheck0；独立domain审查20/20无Critical/Important。真实Phase2新会话32869已重新启动，仍在运行，未提前宣布通过。主站freshGET200HTMLtrue。
- 最新Phase2会话51636整体失败0通过/1失败、临时账号2清理失败0；脱敏trace定位line104第二账号APIRequestContext.get超时。该行前真实Todo v1添加、预览刷新任务保留、深色v2、页面刷新同项目/聊天2/任务保留、退出重登卡片恢复均已走过；优先级v3与最终console/network断言未执行，不称整链通过。
- 无凭据只读transport对比确证：Playwright直连正式API超时、显式复用现有代理返回401。新增production-transport.spec先RED10s超时；playwright.config仅精准正式baseURL时读取已有https/http代理，GREEN1/1，TLS/权限/模型策略未放宽，独立review Critical/Important0。原审批超时未执行，重试是只读请求，非服务故障。
- runner failureSummary此前SSR base64 Cookie脱敏遗漏，测试账号已清理；仅测试helper使用合成样本先RED→GREEN遮盖完整Cookie/Authorization/Set-Cookie及分块/base64，不再输出原trace/header。root fresh默认unit108/108、typecheck/diffcheck通过。不能将原测试日志公开提交。
- 旧本地成功版本的thumbnail缺云artifact时原500已最小修复：先auth/RLS/version/completedrun/path校验，仅artifactPath字段缺失返回诚实200SVG且不下载/build；已记录Storage故障/path不符不降级、PNG保持。独立review无阻断，尚未发布本修复，真实云PNG仍未实现。

- Production-domain修复正式已READY：dpl_9oMdU6K3353jAEan3XCUNBDJb9ZF，主站仍atoms-demo-jiaqi.vercel.app。Owner真实GET单个domain的响应结构与契约一致(name/projectId/verified/branch/customEnvironmentId/redirect)，没有靠mock猜结构。增强probe95391完整成功：resume200/v1/previewReady:true，匿名previewHttpStatus200/fixtureRendered:true，临时账号2/清理失败0；未模型生成、不冒充AI应用验收。
- 已重跑真实Phase2浏览器会话51636（grep Todo创建），使用30s动作超时和原6m生成等待；尚在执行，不提前宣称三轮通过。不同时跑另一个共享Playwright。并行只读复审旧成功项目缺云artifact时thumbnail是否500；无真实用户源码读取或其他项目写入。

- 正式Phase2会话58050真实失败（8分钟、0通过/1失败，临时账号2/清理失败0）：iframe已出现且v1/alias就绪，但frame task-input不存在。脱敏trace确证preview请求302转Vercel SSO，console报vercel.com frame-ancestors none；不能说生成代码坏。StandardProtection豁免production-domain而非任意指production-dpl alias；项目只有2个主站domain，UUID alias未登记。
- 临时测试UUID2285fccc-036e-4662-a096-8bd107fcd810的domain登记探针成功：POST ownAtoms domains返回精准project/verifiedtrue/branch和redirect空。匿名badgrant去掉尾slash后403且应用中文授权错误/no redirect（尾slash为同origin308），证明未关闭平台保护且app grant拒绝仍在；不冒充有效HTML验收。
- Runtime production-domain门禁已增量：alias先拒foreign，所有就绪前GET核验domain name/projectId/verifiedtrue/无branch/customenv/redirect；仅bind missing才POST登记+GET，重新读取可能被平台自动重绑latest的alias，必要时重新assign+finalGETrequested dpl；readonly不写。全部105单元/typecheck及独立review Critical/Important0，正在正式部署会话35446，尚未有部署/有效HTML结果。
- 诊断runner已增强匿名GET真实previewHTML，严格expectedUUID origin/path，手工redirect仅1次同origin同项目同query的308尾slash，外部302不follow、不转Cookie/Auth，200还需明确diagnostic marker。新增2项先RED→GREEN，runner5/5。Phase2/三个代表应用各加actionTimeout30s，generation/version等待6分钟与功能/console/network断言未放宽。root preview-access测试先RED domainReads0!=1，随后新module GREEN，全suite105。
- 用户再次要求并行：DomainAgent写门禁；验收Agent写匿名probe；第三Agent只改两spec动作超时并独立review；root统一真实平台探针/build/deploy/Playwright，避免共享报告互相覆盖。Google继续暂缓，成果保留docs/deferred且.vercelignore排除；本次domain和helper都未改模型策略或env。

- 指纹补丁正式部署已READY：dpl_HaMGjqnLgGJfHKJr8uPpa699kcfz（atoms-demo-b66pd6abd-jiaqis-projects-c666d1ab.vercel.app，142源文件）。真实非AI诊断probe45463：resume200/currentVersion1/previewReady:true/previewError空，两个临时账号清理失败0。该结果证明实际Production指纹与runtime Token匹配、alias管理及签链接通过；仍不冒充真实生成iframe整链。
- 已开始正式Phase2 Playwright执行会话58050（grep Todo创建）：真实模型Todo→深色v2→刷新/重登→原项目恢复→优先级v3→第二账号拒绝；runner新临时账号而非真实用户。尚在运行，不宣称通过；Google继续暂缓/未启用，邮箱公开注册SMTP仍未配置。

- 用户表示此前睡着未见弹窗，已授权重新打开。隐藏输入会话30865：原值格式、与唯一创建记录的prefix/suffix辅助匹配、owner已验证Atoms范围/有效期、同Bearer own200/knownforeign403或404全部通过；用户原始创建来源确认仍是可信设置依据，不把6字符suffix独自当scope证明。Production指纹ATOMS_VERCEL_TOKEN_SHA256已Sensitive新增；第二个Preview环境CLI添加失败（摘要add-server-fingerprint），只读GET确认仅target:[production]，未假称两环境都完成。未覆盖原Token、本地env；不要求重复输入，正式上线继续，Preview开发环境配置后续补。当前正在正式部署指纹补丁，结果以部署/真实probe为准。

- 隐藏输入执行会话72016已结束，exit1，仅安全摘要status:not-completed/step:local hidden input/secretPrinted:false。尚无法区分输入取消、超时或与元数据prefix/suffix不匹配（脚本刻意未记录原值和原错误正文）。执行未进入same-token API或add-server-fingerprint阶段，因此没有新增指纹变量、覆盖Token或修改本地env，也没有部署99单元补丁。下一步先问用户是否看到/填写弹窗，必要时改安全输入诊断以固定reason区分取消/超时/格式/辅助记录不匹配；不要在聊天里索要Token。

- 最新用户已明确“允许”本机隐藏输入原Token并新增server SHA-256指纹；旧“尚未批准”记录由此替代。用户另要求同步网上研究，已查官方repo#17506：项目token ownproject200而user404/team403，未见current附query解锁依据；独立稳定Origin的免费短路径仍现有私有产物+UUID alias，替换为wildcard需可控域名、Sandbox长期URL又受停止/额度/稳定性约束，未贸然改架构。
- Owner凭据仅Node内存直连官方API（CLI api会自动附teamId使token endpoint400，改不带team query）；只读确认唯一名称“Atoms Preview Management”，projectId精准Atoms，expiresAt1794541692114，未revoked/leaked，prefix长4/suffix长6（仅辅助）。原Token值未读取/打印到聊天。本机隐藏输入脚本正在执行，fingerprint配置是否成功以脚本结果为准；未完成输入前不要宣称已配置。
- Runtime指纹增量仅preview-domain和测试：ATOMS_VERCEL_TOKEN_SHA256存在即64hex+sameToken SHA256 timingSafeEqual，错误/空值0网络拒绝，不能退回旧流程；匹配时跳平台不支持current，仍own200/id、knownforeign200/401拒绝、deploymentREADY/project、aliasowner/finalGET全保持。注释明确权限依据来自可信设置的owner元数据与用户原值来源，而非指纹自己证明scope。TDD RED→GREEN，root fresh99/99单元/typecheck及独立review Critical/Important0。尚未正式部署此补丁、未通过线上preview/整链。

- 用户随后确认Google设计和保留原Atoms Token，又追加“Google复杂就先别做”。已解释代码小但需新Google OAuth外部配置：loop是Firebase，不可复制其配置到Supabase。Google暂缓，成果归档docs/deferred/google-login/四文件（callback.patch及3份.ts.disabled）；原callback逐行撤回本轮改动并与HEAD blob一致，login/CSS从未加按钮，provider/env未改，未上线Google。默认96单元/typecheck/patch可恢复检查通过。loop只读参考未输出配置值、未修改其数据或代码。
- 当前预览路径建议：可信本机输入用户保留的原Atoms Token，结合唯一同名创建记录/projectId/有效期核验来源，prefix/suffix仅辅助，不把TokenID当哈希；计算自定义不可逆SHA-256指纹，server env绑定runtime确为此已验证原值。指纹本身不证明权限范围，也不扩大权限。用户正在询问“指纹配置是啥”，尚未批准新增指纹变量或本机隐藏输入；不要写环境配置或弹出凭据输入框。主站现有预览仍不可用，默认runtime保持failclosed。

- 用户追加并行Google账号一键登录（不是仅填写Gmail邮箱）。已呈现bounded设计：登录/注册加Google入口，复用Supabase PKCE及/auth/callback/safeNextPath、保留邮箱/密码、基本openid/email/profile权限，无读邮件/网盘。按brainstorming等待短设计确认，当前只有只读调查，未实现或启用Google provider。所需Google OAuth ClientID/Secret与本项目callback尚待核对，秘密不发聊天。
- 预览授权需要创建时的Token范围与不可逆指纹可信绑定：官方没有TokenID=SHA256(bearerToken)契约，不能猜哈希。项目Token自身metadata404导致当前failclosed。已询问用户是否保留原Token值，仅回有没有，不要发值；若未保留，需在本机安全流程重新创建同Atoms范围Token，不扩大到团队或所有项目。原有Token/环境未轮换或覆盖。

- 最新正式部署更新为 dpl_6m5PcAv2bj2jjVZghD93kPzQJmQf（atoms-demo-40y84ufdq-jiaqis-projects-c666d1ab.vercel.app）。真实非AI诊断probe再次resume200/v1，但previewReady:false：foreign项目HTTP404，增加同Bearer GET /v5/user/tokens/current后仍HTTP404，错误“无法验证当前管理凭据元数据（HTTP 404），禁止自动绑定预览域名”。不能称域名修复完成，不再猜测放宽。两次诊断各2临时账号均清理，失败0。
- 当前默认单测96/96通过、typecheck通过；新增生产runner3项安全测试RED→GREEN，独立复审Critical/Important0。runner使用临时confirmed账号，Node管理凭据仅内存；child严格白名单且ATOMS_E2E_SKIP_LOCAL_ENV=1防dotenv重新加载，30分钟SIGKILL截止、finally逐步清理与非敏感补偿manifest。公开邮件验收不在此runner通过范围。本机Node23 fetch需外层undici.EnvHttpProxyAgent读取现有lowercase代理；首次未代理probe fetch failed，未创建账号。
- 只读部署文件清单已复核：首个4699实际文件，其中generated4494/test-results29，.env/.env.local均0；随后诊断部署163实际文件，generated/test-results均无实际文件（只有空目录），env文件0。不根据此误报密钥泄漏。已向用户请求仅删除首次旧部署的二次确认，未删除。

- 用户已明确批准直接正式部署、定向修复 PostCSS/sharp 并更新锁文件。Next 保持15.5.27，仅覆盖其 PostCSS8.5.30/sharp0.35.5；真实云安装/生产构建成功，npm audit --omit=dev 为0漏洞。
- 正式主站：https://atoms-demo-jiaqi.vercel.app 。最新正式部署 dpl_DahGejideYRFukooUxkJmm8ocWrU 已READY；首页真实浏览器200、截图已查看。尚未完成核心线上验收，不能称全部可用。
- 首次真实生产 Phase2 Playwright 失败（6.1分钟）：真实模型生成Todo、Vercel Sandbox构建、私有产物及数据库v1保存成功，但域名权限探测阻止自动绑定，页面显示“管理凭据未证明拒绝其他项目，禁止自动绑定预览域名”，iframe未出现。正在定向诊断，不放宽安全保护猜测。测试创建的2个临时账号、项目及产物已清理，清理失败0；真实用户数据未动。
- APP_PUBLIC_ORIGIN、ATOMS_PREVIEW_GRANT_SECRET、ATOMS_SCOPE_DENY_PROJECT_ID 已仅新增至本项目Vercel环境；未覆盖本地.env.local。Supabase site_url/redirect已指向正式主站并保留3010本地回调，邮箱确认仍开启。
- 自定义SMTP host/sender未配置，默认SMTP限制团队收件人；临时管理员确认账号不证明公开注册成功。对外邮箱注册仍需真实SMTP配置与收信验收，不得关闭确认绕过。
- 云封面暂未实现真实PNG。已授权请求无PNG时返回200私有不缓存SVG“封面暂未生成”，不冒充截图；独立代码审查无实现阻断项，新2条单测已加入默认测试命令。云失败任务持久化/统一恢复快照/孤儿GC仍待完成。
- 第一次部署未设置.vercelignore，上传约93.8MB/4671个本地源文件（含generated-projects）；随后添加排除env/本地生成目录/测试trace/build缓存的.vercelignore并重部署，最新139文件。首次旧部署仍保留；删除需用户二次确认，不自行销毁。
- 本地HEAD ea63edb及此前云端改动尚未推送远端（远端main为4c8843a）。有已测试但未提交的缩略图和Phase2测试改动；推送前仍需确认。无本地Next服务运行，勿把旧会话当当前服务。

## 最新验证：云 HTTP 增量已接入，尚未部署

- 历史UI已本地提交6d066af；随后增量兼容GenerationResult/恢复响应的可选previewUrl、previewReady、previewError，已保存但地址未就绪仍保留项目/源码/消息，错误面板可重试。浏览器先RED复现new URL(undefined)导致应用崩溃，再GREEN。
- 真实Node云Agent链1/1通过（86.58秒）：真实模型创建v1→真实SDK构建→私有Storage→fencedRPC；读取同一项目DB基线再次真实模型修改为v2，两版本源码/四条聊天/两个completed run/两份产物的真实signedGET200均验证。测试清理随后经独立审查加异常隔离，清理失败分支单测通过；清理补丁后未重跑昂贵模型测试，不夸大验证。
- APIgenerate/resume/restore/status/thumbnail/preview与middleware/hook已加入VERCEL=1云分支，本地分支保持。恢复旧local版本无artifactPath时按owner/project/对应completed run UUID确定不可变对象，missing才从project_versions重建，不推进版本。回滚在同项目租约下构建旧v文件、保存新v、保留消息。HTTP成功保存后才签链接；链接配置失败返回previewReady:false而非构建/保存失败。
- gateway仅接受独立匹配项目域名及短期HMAC grant，grant绑定固定Supabase单对象signedURL；fetch无用户Cookie/JWT、redirect:error、10秒和5MiB流式限制。middleware阻断preview域名上的主站/auth/其他API，仅允许对应项目gateway；API为nodejs，Edge只纯host判断。CSP允许主站APP_PUBLIC_ORIGIN和可信当前VERCEL_URL，禁止网络连接。renderer将当前单entry Vite的JS/CSS内嵌dataURI；真实浏览器iframe计数、刷新localStorage与两项目origin隔离契约1/1通过，不冒充线上AI页面验收。
- renderer兼容限制：未支持JS内部分包/import/Worker/运行时相对assetURL；现源码规则已禁止动态import，仍不得宣称通用Vite支持。CSS @import、srcset和外链资源明确拒绝；正则只针对受控固定index模板，不是通用HTML解析器。内嵌预算8MiB，Storage对象5MiB。
- 稳定预览host为atoms-app-{完整UUID}.vercel.app。独立review指出alias GET→POST没有原子CAS；运行时ensurePreviewAlias仅GET核验，missing或旧部署即failclosed；bindPreviewAlias只导出控制面入口、暂无runtime调用，不假装自动配置成功。用户Token元数据核验projectId为本Atoms、30天有效，但Sensitiveenv的实际权限与绑定能力还需测试部署验证后才能开放自动绑定；这仍阻塞新用户首次自动预览，不可称线上可用。
- 最终统一验证：npm run test:unit 84/84通过（包括云/API/grant/host/cleanup，外部传输契约不冒充真实云）；生产build通过；完整Playwright29通过/5跳过/0失败（1.1分钟），含真实本地模型/DB/沙盒回滚继续修改。独立UI/renderer/SQL/cloudHTTP复审无Critical/Important。当前本地服务会话43203，http://127.0.0.1:3010，绑定0.0.0.0。
- 未执行部署、自动runtime域名绑定或付费升级。已通过异步问题请求两项确认：首次Vercel Preview测试部署；定向PostCSS8.5.30/sharp0.35.5依赖修复并更新锁文件（保留Next15.5.27）。答复前不改锁或发布。新增云配置仍需ATOMS_PREVIEW_GRANT_SECRET（随机>=32bytes，Sensitive）和APP_PUBLIC_ORIGIN；本地env未改。
- 生产依赖只读npm audit --omit=dev：0critical/2high/1moderate，Next绑定postcss8.4.31/sharp0.34.5，registry最新8.5.30/0.35.5。不运行audit fix --force，不自动升Next16。云封面暂无真实PNG返回503并保留可打开项目fallback；云失败任务仍未持久化，统一快照/孤儿GC/完整邮件用例/大陆网络与线上浏览器验收仍待完成。

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
