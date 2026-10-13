# Atoms Demo 最小技术架构可行性报告

更新时间：2026-10-13（Asia/Shanghai）

## 1. 结论

本轮在不开发完整 UI 和 Agent 的前提下，完成了四项技术链路验证。

| 验证项 | 结果 | 实测证据 |
| --- | --- | --- |
| Next.js 服务启动 | 通过 | Next.js 15.3.9 启动完成；`GET /api/health` 返回 HTTP 200。 |
| 模型 API 真实响应 | 通过 | 使用 `ai-news-radar` 的 DashScope OpenAI-compatible API；`qwen3.8-flash` 返回 HTTP 200 和非空文本，服务端耗时 1358 ms。 |
| 沙盒运行预写 Vite 示例 | 有条件通过 | React + Vite 生产构建通过；macOS `sandbox-exec` 独立进程在 4173 端口返回 HTTP 200。容器级隔离因本机没有 Docker 尚未验证。 |
| iframe 加载沙盒预览 | 通过 | Chromium 从 3000 宿主页加载 4173 iframe；标题可见，React 按钮点击后由 0 更新为 1，无页面错误。 |

## 2. 最小架构

```text
浏览器
  └─ Next.js 宿主（127.0.0.1:3000）
       ├─ GET /api/health
       ├─ POST /api/model
       │    └─ OpenAI SDK → DashScope OpenAI-compatible API
       └─ sandboxed iframe
            └─ 受控 Vite 进程（127.0.0.1:4173）
                 └─ 预写 React 示例
```

宿主和预览使用不同端口，因此属于不同 Origin。iframe 未设置 `allow-same-origin`，只开放 `allow-scripts` 和 `allow-forms`。Viewer 工具条留在宿主页面，生成应用只占据 iframe 内容区，这与 `docs/UI_SPEC.md` 的最小 Viewer 边界一致。

## 3. 实现范围

### 3.1 Next.js 宿主

- App Router、TypeScript、Tailwind CSS。
- `/api/health` 用于服务存活验证。
- `/api/model` 只在服务器端读取模型变量，不向浏览器暴露密钥。
- 首页仅为技术验证壳，未复刻完整首页或 Agent 工作区。

### 3.2 模型链路

- SDK：`openai` 6.49.0。
- 实际提供商：DashScope OpenAI-compatible API。
- 实测模型：`qwen3.8-flash`。
- 运行时从 `/Users/jiaqizhong/ai-news-radar/.env.local` 注入 `LLM_BASE_URL` 和 `LLM_API_KEY`；本项目不保存其值。
- 接口通过 Chat Completions 兼容协议发起真实请求，没有使用 mock。

### 3.3 本地受控运行环境

本轮本地 PoC 使用 macOS `sandbox-exec`：

- 固定执行 Vite，不接受用户提供的命令。
- 固定工作目录为 `sandbox-template/`。
- 环境变量采用白名单，只传递 `PATH`、`TMPDIR`、`NODE_ENV` 和 `NO_COLOR`，不传递模型密钥。
- 项目和依赖目录只读；只允许写入指定系统临时目录。
- 明确拒绝读取 `ai-news-radar/.env.local`。

沙盒内只读探针尝试打开该环境文件时返回 `EPERM`，且没有读取或输出文件内容。

当前策略为跑通预写示例而允许网络访问，因此只足以证明架构链路，不应直接运行不可信生成代码。

### 3.4 容器目标

`sandbox-template/Dockerfile` 已提供容器运行边界，Vite 在容器模式下监听 `0.0.0.0:4173`。但本机没有 `docker`、Podman、Colima 或 Lima，因此不能声称容器构建和运行已通过。生产阶段必须在具备容器运行时的环境补测以下内容：

- 非 root 用户运行。
- 只读根文件系统和临时写目录。
- CPU、内存、进程数和执行时限。
- 默认禁用外网，仅开放必要依赖下载代理。
- 每个项目独立容器或等价隔离单元。
- 预览地址生命周期和销毁策略。

## 4. 逐项测试记录

### 4.1 Next.js

第一次在工具默认沙箱内监听 3000 端口时返回 `EPERM`。在获得本机回环监听权限后，服务启动成功：

```text
Next.js 15.3.9
Ready in 2s
GET /api/health → HTTP 200
```

响应：

```json
{"ok":true,"service":"atoms-demo-host","runtime":"nodejs"}
```

### 4.2 模型 API

第一次调用沿用了 `ai-news-radar` 环境文件中的旧默认模型，提供商返回 `403 Free quota exhausted`。这证明端点可达，但该模型额度不可用。

不修改原环境文件，仅把当前进程的模型覆盖为交接文档中已验证的 `qwen3.8-flash` 后，调用成功：

```json
{
  "ok": true,
  "provider": "dashscope-openai-compatible",
  "model": "qwen3.8-flash",
  "text": "Atoms 模型链路正常",
  "latencyMs": 1358
}
```

### 4.3 Vite 示例

- `npm run sandbox:build`：通过，28 个模块完成转换。
- `npm run sandbox:dev`：通过，Vite 6.4.4 在 61–67 ms 内启动。
- `GET http://127.0.0.1:4173/`：HTTP 200。

构建期间发现并修正了两个配置问题：TypeScript 项目引用与 `noEmit` 冲突；Vite 默认配置加载器试图写入只读的 `node_modules/.vite-temp`。最终使用原生配置加载器，依赖目录保持只读。

### 4.4 iframe

首次浏览器检查发现 iframe 文档存在，但 React 模块没有运行。原因是 iframe 不含 `allow-same-origin`，模块请求的 Origin 为 `null`，而 Vite 未返回允许跨源模块加载的响应头。

在 Vite 预览服务增加 `Access-Control-Allow-Origin: *` 后，保持 iframe 沙盒属性不变，Playwright 实测结果为：

```json
{
  "ok": true,
  "hostUrl": "http://127.0.0.1:3000/",
  "iframeUrl": "http://127.0.0.1:4173/",
  "sandbox": "allow-forms allow-scripts",
  "title": "预写 React 示例已运行",
  "interaction": "已点击 1 次",
  "pageErrors": []
}
```

测试截图保存在临时路径 `/private/tmp/atoms-demo-iframe.png`，不进入仓库。

## 5. 构建与安全检查

- `npm run typecheck`：通过。
- `npm run build`：通过，Next.js 生产构建生成 4 个路由。
- `npm run sandbox:build`：通过。
- 源码密钥模式扫描：未发现硬编码 API Key 或 Bearer Token。
- 沙盒密钥文件读取探针：返回 `EPERM`。
- `.gitignore` 已排除环境文件、构建目录、依赖目录和 TypeScript 增量缓存。

## 6. 本轮不包含

- 完整 Atoms 首页和 Agent 工作区 UI。
- Prompt 到代码的生成 Agent。
- 任意用户代码执行。
- 三模型竞赛、失败回退和流式步骤。
- 登录、数据库、版本历史和持久化。
- 发布、导出和线上部署。

## 7. 下一阶段进入条件

在开始完整生成 Agent 前，至少需要先完成容器级沙盒验证，并确定线上沙盒提供方或部署环境。完成后再把“预写示例”替换为“生成 artifact”，同时保持宿主、模型调用、构建执行和 iframe Origin 四层边界不变。
