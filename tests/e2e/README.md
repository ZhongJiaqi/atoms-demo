# 代表性端到端测试

本目录固化三个真实生成用例：

1. 任务管理：添加、完成、删除、优先级和双层持久化。
2. 个人记账：录入、分类、统计、删除和双层持久化。
3. 习惯打卡：创建、打卡、进度、删除和双层持久化。

测试会调用真实模型 API、等待受控构建、检查项目接口并操作真实 iframe。验收分成两层：

1. **项目层：** 生成后 URL 必须绑定当前 `projectId`；刷新宿主页后仍恢复同一个项目、完整源码、用户与 Agent 消息、执行事件，以及相同的最新成功版本和真实预览。
2. **应用层：** 任务、账目、习惯和完成/打卡状态必须在 Viewer 刷新及宿主页刷新后保留。测试只规定用户结果，不强制模型使用 `localStorage`；实现可以采用独立预览 Origin、受限 Runtime 桥或等价安全方案。

三个应用仍必须完成真实核心交互、遵守测试节点契约且浏览器零错误。业务数据持久化不能通过放宽主站同源权限来换取。

首次运行先安装项目锁定版本的 Chromium：

```bash
npm run test:e2e:install
```

## 运行前提

先按 `docs/ONLINE_LAUNCH_CHECKLIST.html` 填好本项目的 `.env.local`，再启动 Atoms Demo。不要 `source` 其他项目的环境文件：

```bash
npm run dev -- --hostname 127.0.0.1
```

然后在另一个终端执行：

```bash
E2E_REAL_MODEL=1 ATOMS_E2E_BASE_URL=http://127.0.0.1:3000 npm run test:e2e:representative
```

认证与持久化验收还需要在当前终端设置 `E2E_PRIMARY_EMAIL`、`E2E_PRIMARY_PASSWORD`、`E2E_OTHER_EMAIL` 和 `E2E_OTHER_PASSWORD`。这些账号必须来自本项目连接的真实 Supabase Auth，不能使用 Mock。

默认打开可见 Chromium。无图形环境时可显式增加 `HEADLESS=true`。测试必须串行运行，因为 Demo 同一时间只允许一个生成任务。

未设置 `E2E_REAL_MODEL=1` 时测试会跳过，避免误调用模型或消耗额度。HTML 报告输出到 `playwright-report/`，失败截图和 trace 输出到 `test-results/`。

## 历史版本回滚验收

```bash
HEADLESS=true E2E_REAL_MODEL=1 ATOMS_E2E_BASE_URL=http://127.0.0.1:3010 npm run test:e2e:rollback
```

需已登录的 Supabase CLI，以及本项目 `.env.local` 中的公开 Supabase 配置和模型配置。用例仅在测试 Node 进程取得本项目管理凭据，自动创建两个临时已确认账号，结束时清理本用例账号、项目和临时运行目录；不会读取或删除已有真实用户的数据。管理凭据不写入环境文件或浏览器。测试报告与 trace 可能包含临时账号会话信息，不要公开上传。

用例先通过真实 RLS 保存两个明确的测试源码版本（不冒称模型生成），再验证真实登录、v2 恢复 v1 并保存为 v3、iframe 点击、源码与事件一致、页面刷新、一次真实模型修改为 v4、首页项目卡片、再次通过 UI 恢复为 v5、临时目录回收及第二账号无权恢复原项目。保存响应丢失等故障另由 `tests/persistence/restore-version.test.ts` 验证；真实沙盒进程退出拒绝激活由 `types-file-sandbox.spec.ts` 验证。

2026-10-14 追加：首页创建一个真实无成功版本草稿，断言仍只有一张成功项目卡；真实PNG封面版本/签名/尺寸、旧新封面差异、截图目录回收；同一浏览器退出A再登录B后，旧封面URL必须经网络鉴权返回404，不能读取浏览器私有缓存。

## UI 与封面安全回归

`responsive-design.spec.ts` 验证320–2560px、手机横竖屏与模拟80%/125%/200%桌面缩放后的有效CSS viewport；工作区部分使用明确的API契约样本，只证明UI交互，不是模型/数据库验收。覆盖Enter/Shift+Enter/IME、键盘图标提示、弹层focus/Escape、发送按钮位置、无横向溢出和reduced-motion。

`project-thumbnail.spec.ts` 验证未登录拒绝及真实Chromium的HTTP/WebSocket/WebRTC通道守卫。对应缓存/排队边界由单元测试覆盖。请勿同时运行多个Playwright命令共用默认报告目录，避免trace被互相清理。
