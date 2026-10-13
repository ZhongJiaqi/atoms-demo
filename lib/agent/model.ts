import OpenAI from "openai";

import type { GeneratedProject, ProjectPatch } from "./types";

type ModelConfig = {
  apiKey: string;
  baseURL: string;
  model: string;
};

const MAX_MODEL_OUTPUT_TOKENS = 8_000;
const MAX_JSON_ATTEMPTS = 2;

const SYSTEM_PROMPT = `你是 Atoms Demo 的核心 Coding Agent。你必须根据用户需求生成一个真实、可运行、具有明确视觉设计的 React + TypeScript 单页应用。

输出必须是单个 JSON 对象，不要 Markdown，不要代码围栏。结构：
{
  "projectName": "简短中文项目名",
  "summary": "一句话说明实际实现内容",
  "files": [
    {"path":"src/App.tsx","content":"..."},
    {"path":"src/styles.css","content":"..."}
  ]
}

硬性约束：
1. 必须包含 src/App.tsx 和 src/styles.css，App.tsx 必须 default export React 组件。
2. 可增加 src/components/*.tsx 和 src/data/*.ts，总文件数不超过 16。
3. 只允许从 react 或相对路径导入；不得引用任何其他 npm 包。
4. 不得使用 fetch、XMLHttpRequest、WebSocket、EventSource、eval、Function、动态 import、require、dangerouslySetInnerHTML。
5. 不得生成 package.json、HTML、Vite 配置、入口文件、服务端文件或脚本。
6. 所有功能必须使用内存状态和浏览器标准能力实现；不要依赖远程图片、字体、接口或 CDN。
7. 页面必须响应式、内容完整、文字与用户需求匹配，并至少包含一个可验证的真实交互。
8. 禁止生成通用 Todo 示例，除非用户明确要求 Todo 应用。
9. CSS 必须完整写在 src/styles.css 中，不使用 Tailwind。
10. 保持实现精炼，避免重复样式和冗长静态数据，确保完整 JSON 能在输出限制内结束。`;

const PATCH_SYSTEM_PROMPT = `你是 Atoms Demo 的增量 Coding Agent。你会收到一个已经可以运行的 React + TypeScript 项目，以及用户的新修改需求。你必须保留已有功能，只修改满足新需求所必需的文件。

输出必须是单个 JSON 对象，不要 Markdown，不要代码围栏。结构：
{
  "projectName": "仅在确有必要时提供更新后的项目名，否则省略",
  "summary": "一句话说明本轮实际修改内容",
  "files": [
    {"path":"src/App.tsx","content":"该文件修改后的完整内容"}
  ],
  "deletedFiles": []
}

硬性约束：
1. files 只能包含本轮确实需要修改或新增的文件；不得返回内容未变化的文件。
2. 每个 files 条目必须给出该文件修改后的完整内容，不要给 diff。
3. deletedFiles 只能列出确实不再需要的 src/components/*.tsx 或 src/data/*.ts；不得删除 src/App.tsx 或 src/styles.css。
4. 只允许从 react 或相对路径导入；不得引用任何其他 npm 包。
5. 不得使用 fetch、XMLHttpRequest、WebSocket、EventSource、eval、Function、动态 import、require、dangerouslySetInnerHTML。
6. 不得修改 package.json、HTML、Vite 配置、入口文件、服务端文件或脚本。
7. 所有功能必须使用内存状态和浏览器标准能力实现；不要依赖远程图片、字体、接口或 CDN。
8. 修改后必须继续满足此前全部用户需求，并保持响应式和至少一个真实交互。
9. CSS 必须写在 src/styles.css 中，不使用 Tailwind。
10. 保持补丁精炼，避免重复返回未变化代码，确保完整 JSON 能在输出限制内结束。`;

function getModelConfig(): ModelConfig {
  if (!process.env.LLM_API_KEY || !process.env.LLM_BASE_URL) {
    throw new Error("缺少模型凭证：请配置 LLM_API_KEY 与 LLM_BASE_URL。");
  }

  return {
    apiKey: process.env.LLM_API_KEY,
    baseURL: process.env.LLM_BASE_URL,
    model: process.env.LLM_MODEL || "qwen3.8-flash",
  };
}

function stripCodeFence(value: string): string {
  const trimmed = value.trim();
  const match = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return match?.[1] ?? trimmed;
}

function parseProject(text: string): GeneratedProject {
  const parsed = JSON.parse(stripCodeFence(text)) as Partial<GeneratedProject>;
  if (
    typeof parsed.projectName !== "string" ||
    typeof parsed.summary !== "string" ||
    !Array.isArray(parsed.files)
  ) {
    throw new Error("模型返回的项目 JSON 结构不完整。");
  }
  return parsed as GeneratedProject;
}

function parsePatch(text: string): ProjectPatch {
  const parsed = JSON.parse(stripCodeFence(text)) as Partial<ProjectPatch>;
  if (
    typeof parsed.summary !== "string" ||
    !Array.isArray(parsed.files) ||
    !Array.isArray(parsed.deletedFiles) ||
    (parsed.projectName !== undefined && typeof parsed.projectName !== "string")
  ) {
    throw new Error("模型返回的增量补丁 JSON 结构不完整。");
  }
  return parsed as ProjectPatch;
}

async function requestJson<T>(
  messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
  temperature: number,
  parse: (text: string) => T,
  label: string,
) {
  const config = getModelConfig();
  const client = new OpenAI({ apiKey: config.apiKey, baseURL: config.baseURL });
  const isDashScope = config.baseURL.includes("dashscope.aliyuncs.com");
  const requiresThinking = /^(glm-5\.3|qwen3\.8-2\.4t-a95b)$/i.test(config.model);
  const supportsThinkingToggle = /^(deepseek-v4|qwen3|glm-5|kimi-k\d)/i.test(config.model);
  const supportsTemperature = !isDashScope || !/^kimi-k3$/i.test(config.model);
  let retryMessages = messages;

  for (let attempt = 1; attempt <= MAX_JSON_ATTEMPTS; attempt += 1) {
    const requestBody = {
      model: config.model,
      messages: retryMessages,
      response_format: { type: "json_object" as const },
      ...(supportsTemperature ? { temperature } : {}),
      max_tokens: MAX_MODEL_OUTPUT_TOKENS,
      ...(isDashScope && supportsThinkingToggle
        ? { enable_thinking: requiresThinking }
        : {}),
    } as OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming & {
      enable_thinking?: boolean;
    };
    const response = await client.chat.completions.create(requestBody, {
      signal: AbortSignal.timeout(120_000),
    });
    const choice = response.choices[0];
    const text = choice?.message.content?.trim();
    if (!text) throw new Error(`真实模型返回成功，但${label}内容为空。`);

    try {
      if (choice.finish_reason === "length") {
        throw new SyntaxError("模型输出达到长度上限，JSON 未完整结束。");
      }
      return { value: parse(text), model: config.model };
    } catch (error) {
      if (attempt === MAX_JSON_ATTEMPTS) {
        const detail = error instanceof Error ? error.message : "JSON 无法解析";
        throw new Error(`模型连续两次返回了不完整的${label} JSON：${detail}`);
      }
      retryMessages = [
        ...messages,
        {
          role: "user",
          content: "上一次响应没有形成完整可解析的 JSON。请重新生成更精炼的实现，删除重复样式和非必要静态内容，务必闭合所有字符串、数组和对象；仍然只返回单个 JSON 对象。",
        },
      ];
    }
  }

  throw new Error(`模型未能返回有效的${label} JSON。`);
}

async function complete(messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[]) {
  const completed = await requestJson(messages, 0.25, parseProject, "项目");
  return { project: completed.value, model: completed.model };
}

async function completePatch(messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[]) {
  const completed = await requestJson(messages, 0.2, parsePatch, "增量补丁");
  return { patch: completed.value, model: completed.model };
}

function serializeProject(project: GeneratedProject) {
  return project.files
    .map((file) => `--- ${file.path} ---\n${file.content}`)
    .join("\n\n")
    .slice(0, 110_000);
}

export async function generateProject(requirement: string) {
  return complete([
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content: `请实现以下应用。必须逐项体现需求，不要替换成示例页面：\n\n${requirement}`,
    },
  ]);
}

export async function repairProject(
  requirement: string,
  current: GeneratedProject,
  buildLog: string,
  round: number,
) {
  const files = current.files
    .map((file) => `--- ${file.path} ---\n${file.content}`)
    .join("\n\n")
    .slice(0, 80_000);

  return complete([
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content: `这是第 ${round} 轮自动修复。原始需求：\n${requirement}\n\n当前文件：\n${files}\n\n真实 TypeScript/Vite 构建日志：\n${buildLog.slice(-10_000)}\n\n请定位日志中的错误并返回修复后的完整 JSON 项目。不要删掉已经满足的用户功能。`,
    },
  ]);
}

export async function modifyProject(
  requirement: string,
  current: GeneratedProject,
  priorRequirements: string[],
) {
  return completePatch([
    { role: "system", content: PATCH_SYSTEM_PROMPT },
    {
      role: "user",
      content: `项目当前名称：${current.projectName}\n项目当前摘要：${current.summary}\n\n此前需求：\n${priorRequirements.map((item, index) => `${index + 1}. ${item}`).join("\n")}\n\n当前项目完整文件：\n${serializeProject(current)}\n\n本轮修改需求：\n${requirement}\n\n请只返回为满足本轮需求必须变化的文件。`,
    },
  ]);
}

export async function repairProjectPatch(
  requirement: string,
  current: GeneratedProject,
  buildLog: string,
  round: number,
) {
  return completePatch([
    { role: "system", content: PATCH_SYSTEM_PROMPT },
    {
      role: "user",
      content: `这是增量修改后的第 ${round} 轮自动修复。最新用户需求：\n${requirement}\n\n当前候选项目完整文件：\n${serializeProject(current)}\n\n真实 TypeScript/Vite 构建日志：\n${buildLog.slice(-10_000)}\n\n请定位日志错误，只返回修复错误所必需变化的文件。不要撤销已经满足的历史功能。`,
    },
  ]);
}

