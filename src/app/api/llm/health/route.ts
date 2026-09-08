import { NextRequest, NextResponse } from "next/server";
import { callLLM } from "@/lib/llm/client";
import type { LLMTask } from "@/lib/llm/types";

/**
 * GET /api/llm/health — Diagnóstico del proxy LLM.
 *
 * Hace una llamada mínima REAL al LLM y reporta qué proveedor/modelo respondió,
 * si la función de tools se ejecutó, y el tiempo que tardó. Sirve para confirmar
 * qué proveedor está activo en la cascada (ej. verificar que DeepSeek es el
 * primario de la tarea `assistant` y que su API key funciona).
 *
 * Protegido con el mismo LOGAN_LLM_SECRET que POST /api/llm.
 *
 * Query params (opcionales):
 *   - task: tarea a probar (default "assistant", la del bot de pedidos)
 *   - tools: "1" para incluir una tool de prueba y verificar function calling
 *
 * Respuesta:
 * {
 *   ok, task, provider, model, tookMs,
 *   usedTool,           // true si el modelo emitió un tool_call
 *   textPreview,        // primeros chars de la respuesta
 *   usage
 * }
 */

const VALID_TASKS = new Set<string>([
  "core_decide", "core_integrate", "dev", "design", "analytics",
  "legal", "validator", "marketing", "finance", "support", "assistant", "showcase",
]);

// Tool trivial para comprobar si el proveedor primario soporta function calling.
const PING_TOOL = {
  type: "function" as const,
  function: {
    name: "responder_ping",
    description: "Llama a esta función para responder al ping de diagnóstico.",
    parameters: {
      type: "object",
      properties: {
        estado: { type: "string", description: "Escribe 'ok'." },
      },
      required: ["estado"],
    },
  },
};

export async function GET(req: NextRequest) {
  // Auth: mismo secreto compartido que el proxy principal.
  const secret = process.env.LOGAN_LLM_SECRET;
  if (secret) {
    const authHeader = req.headers.get("authorization");
    if (!authHeader || authHeader !== `Bearer ${secret}`) {
      return NextResponse.json(
        { error: "Unauthorized. Invalid or missing LOGAN_LLM_SECRET." },
        { status: 401 }
      );
    }
  }

  const taskParam = req.nextUrl.searchParams.get("task") || "assistant";
  const task: LLMTask = (VALID_TASKS.has(taskParam) ? taskParam : "assistant") as LLMTask;
  const withTools = req.nextUrl.searchParams.get("tools") === "1";

  const started = Date.now();
  try {
    const result = await callLLM({
      task,
      systemPrompt:
        "Eres un verificador de diagnóstico. Responde de forma mínima." +
        (withTools ? " Si tienes una herramienta disponible, llámala." : ""),
      userMessage: withTools ? "Haz ping llamando a la herramienta." : "Responde solo: ok",
      history: [],
      maxTokens: 50,
      temperature: 0,
      ...(withTools ? { tools: [PING_TOOL], toolChoice: "auto" as const } : {}),
    });

    return NextResponse.json({
      ok: true,
      task,
      provider: result.provider,
      model: result.model,
      tookMs: Date.now() - started,
      usedTool: !!(result.toolCalls && result.toolCalls.length > 0),
      textPreview: (result.text || "").slice(0, 80),
      usage: result.usage,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { ok: false, task, tookMs: Date.now() - started, error: message.slice(0, 400) },
      { status: 502 }
    );
  }
}
