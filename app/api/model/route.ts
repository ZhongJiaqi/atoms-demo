import OpenAI from "openai";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ModelConfig = {
  apiKey: string;
  baseURL: string;
  model: string;
};

function getModelConfig(): ModelConfig {
  if (process.env.LLM_API_KEY && process.env.LLM_BASE_URL) {
    return {
      apiKey: process.env.LLM_API_KEY,
      baseURL: process.env.LLM_BASE_URL,
      model: process.env.LLM_MODEL || "qwen3.8-flash",
    };
  }

  throw new Error("缺少模型凭证：请配置 LLM_API_KEY 与 LLM_BASE_URL。");
}

export async function POST() {
  const startedAt = Date.now();

  try {
    const config = getModelConfig();
    const client = new OpenAI({ apiKey: config.apiKey, baseURL: config.baseURL });
    const response = await client.chat.completions.create({
      model: config.model,
      messages: [{ role: "user", content: "只回复：Atoms 模型链路正常" }],
      max_tokens: 32,
    });
    const text = response.choices[0]?.message.content?.trim() ?? "";

    if (!text) {
      throw new Error("模型返回成功，但文本响应为空。");
    }

    return NextResponse.json({
      ok: true,
      provider: "dashscope-openai-compatible",
      model: config.model,
      text,
      latencyMs: Date.now() - startedAt,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "未知模型错误";
    return NextResponse.json(
      { ok: false, error: message, latencyMs: Date.now() - startedAt },
      { status: 502 },
    );
  }
}
