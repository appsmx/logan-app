import { NextRequest, NextResponse } from "next/server";
import { callLLM } from "@/lib/llm/client";
import type { LLMTask } from "@/lib/llm/types";
import { db } from "@/lib/db";
import { estimateCostUsd } from "@/lib/llm/usage-cost";

/**
 * POST /api/llm — LLM Proxy endpoint for Logan ecosystem services.
 *
 * Allows external services (restaurant-pos, logan-app clients) to call
 * the LLM without managing their own API keys. Authentication via
 * LOGAN_LLM_SECRET shared token.
 *
 * Request body:
 * {
 *   task: LLMTask (e.g., "assistant", "analytics", "support")
 *   systemPrompt: string
 *   userMessage: string
 *   history?: { role: "user"|"assistant"|"system", content: string }[]
 *   maxTokens?: number
 *   temperature?: number
 * }
 *
 * Response:
 * {
 *   text: string
 *   provider: string
 *   model: string
 * }
 */

const VALID_TASKS: Set<string> = new Set([
  "core_decide", "core_integrate", "dev", "design", "analytics",
  "legal", "validator", "marketing", "finance", "support", "assistant", "showcase",
]);

export async function POST(req: NextRequest) {
  try {
    // Auth: verify shared secret
    const authHeader = req.headers.get("authorization");
    const secret = process.env.LOGAN_LLM_SECRET;

    if (secret) {
      // If secret is configured, enforce it
      if (!authHeader || authHeader !== `Bearer ${secret}`) {
        return NextResponse.json(
          { error: "Unauthorized. Invalid or missing LOGAN_LLM_SECRET." },
          { status: 401 }
        );
      }
    }
    // If no secret is configured (dev mode), allow all requests

    const body = await req.json();
    const { task, systemPrompt, userMessage, history, maxTokens, temperature, project } = body;

    // Validate required fields
    if (!systemPrompt || !userMessage) {
      return NextResponse.json(
        { error: "Missing required fields: systemPrompt, userMessage" },
        { status: 400 }
      );
    }

    // Default task to "assistant" if not provided or invalid
    const effectiveTask: LLMTask = VALID_TASKS.has(task) ? task : "assistant";

    // Call LLM with fallback chain
    const result = await callLLM({
      task: effectiveTask,
      systemPrompt,
      userMessage,
      history: history || [],
      maxTokens: maxTokens || 4096,
      temperature: temperature ?? 0.7,
    });

    // Registrar el uso para control de gasto por proyecto (no bloquea la respuesta)
    const costUsd = estimateCostUsd(
      result.model,
      result.usage?.promptTokens || 0,
      result.usage?.completionTokens || 0
    );
    db.llmUsage
      .create({
        data: {
          project: typeof project === "string" && project.trim() ? project.trim() : "desconocido",
          task: effectiveTask,
          provider: result.provider,
          model: result.model,
          promptTokens: result.usage?.promptTokens || 0,
          completionTokens: result.usage?.completionTokens || 0,
          totalTokens: result.usage?.totalTokens || 0,
          costUsd,
        },
      })
      .catch((e) => console.error("[/api/llm] No se pudo registrar el uso:", e?.message));

    return NextResponse.json({
      text: result.text,
      provider: result.provider,
      model: result.model,
      usage: result.usage,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[/api/llm] Error:", message);

    // Determine status code
    const status = message.includes("No LLM provider") ? 503 : 500;

    return NextResponse.json(
      { error: message },
      { status }
    );
  }
}

// GET /api/llm — health check / info
export async function GET() {
  return NextResponse.json({
    service: "Logan LLM Proxy",
    version: "1.0",
    providers: ["gemini", "groq", "openrouter", "mistral", "zai", "deepseek", "openai"],
    status: "ok",
    docs: "POST /api/llm with { task, systemPrompt, userMessage }",
  });
}
