// LLM client: provider-agnostic call function with chained fallback.
// Uses plain fetch — works on Vercel, no SDK auto-injection needed.
// DEC-LOGAN-006: provider independence.
// DEC-LOGAN-017: per-task preference chain — tries best model first, falls
//                back to cheaper/worse on error, never blocks on a single model.

import type { LLMConfig, LLMRequest, LLMResponse, LLMMessage, LLMToolCall } from "./types";
import { getLLMConfigWithFallback } from "./config";

/**
 * HTTP status codes that should trigger fallback (don't retry the same model,
 * try the next in the chain).
 *
 * - 401: bad/missing API key
 * - 403: forbidden (key doesn't have access to this model)
 * - 404: model doesn't exist (e.g. glm-5.2 may not be deployed yet)
 * - 408: request timeout from provider
 * - 429: rate limit / insufficient balance
 * - 5xx: provider server error
 */
const FALLBACK_STATUS = new Set([401, 403, 404, 408, 429, 500, 502, 503, 504]);

/**
 * Proveedores que NO soportan function calling de forma fiable en nuestra
 * integración. Cuando una petición trae `tools`, estos se saltan en la cascada
 * (para no perder la capacidad de invocar herramientas por caer en uno que las
 * ignora). El resto (OpenAI-compatibles + Gemini) sí las soportan.
 */
const NO_TOOL_SUPPORT = new Set<string>([
  // OpenRouter con modelos :free a veces no expone tools de forma consistente.
  "openrouter",
]);

export async function callLLM(request: LLMRequest): Promise<LLMResponse> {
  let options = getLLMConfigWithFallback(request.task);
  if (options.length === 0) {
    throw new Error(
      "No LLM provider available. Set ZAI_API_KEY or GEMINI_API_KEY.",
    );
  }

  // Si la petición usa function calling, filtrar proveedores que no lo soporten
  // bien. Si el filtro deja la lista vacía (raro), caemos a la lista original
  // para al menos responder con texto en vez de fallar del todo.
  const usingTools = !!request.tools && request.tools.length > 0;
  if (usingTools) {
    const filtered = options.filter((o) => !NO_TOOL_SUPPORT.has(o.provider));
    if (filtered.length > 0) options = filtered;
  }

  // Try each option in order. Collect errors for diagnostics.
  const errors: string[] = [];
  for (let i = 0; i < options.length; i++) {
    const config = options[i];
    try {
      if (config.provider === "zai") {
        return await callZai(config, request);
      } else if (config.provider === "gemini") {
        return await callGemini(config, request);
      } else if (config.provider === "openai") {
        return await callOpenAI(config, request);
      } else if (
        config.provider === "deepseek" ||
        config.provider === "groq" ||
        config.provider === "openrouter" ||
        config.provider === "mistral"
      ) {
        // Todos usan la API compatible con OpenAI (/chat/completions)
        return await callOpenAICompatible(config, request);
      }
      errors.push(`[${config.provider}/${config.model}] unknown provider`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`[${config.provider}/${config.model}] ${msg}`);

      // Decide whether to fall back or rethrow.
      // Network errors and FALLBACK_STATUS errors → try next option.
      // Other errors (e.g. malformed response after a 200) → still try next
      // because we want resilience.
      // If this was the last option, we'll throw below.
      if (i === options.length - 1) {
        // No more options — throw a combined error.
        throw new Error(
          `All LLM options failed for task "${request.task}":\n${errors.join("\n")}`,
        );
      }
      // Otherwise: log and try the next option.
      console.warn(
        `[llm] task="${request.task}" option ${i + 1}/${options.length} ` +
          `(${config.provider}/${config.model}) failed: ${msg}. Trying next.`,
      );
    }
  }

  // Should never reach here (loop either returns or throws), but TS safety.
  throw new Error(`LLM call failed for task "${request.task}"`);
}

// ─── Helpers de function calling (formato OpenAI) ────────────────────────────

/**
 * Serializa un LLMMessage del historial al formato de mensajes de OpenAI,
 * preservando tool_calls (en mensajes assistant) y las respuestas de tool.
 * Los proveedores OpenAI-compatibles (Z.ai, DeepSeek, Groq, Mistral, OpenAI)
 * comparten esta forma.
 */
function toOpenAIMessage(m: LLMMessage): Record<string, unknown> {
  if (m.role === "tool") {
    return {
      role: "tool",
      content: m.content || "",
      tool_call_id: m.tool_call_id,
    };
  }
  if (m.role === "assistant" && m.tool_calls && m.tool_calls.length > 0) {
    return {
      role: "assistant",
      content: m.content || "",
      tool_calls: m.tool_calls.map((tc) => ({
        id: tc.id,
        type: "function",
        function: { name: tc.function.name, arguments: tc.function.arguments },
      })),
    };
  }
  return { role: m.role, content: m.content };
}

/**
 * Construye el array `messages` para un request OpenAI-compatible, incluyendo
 * system + historial (con tool calls) + el mensaje de usuario actual.
 */
function buildOpenAIMessages(request: LLMRequest): Record<string, unknown>[] {
  const messages: Record<string, unknown>[] = [
    { role: "system", content: request.systemPrompt },
  ];
  if (request.history && request.history.length > 0) {
    for (const m of request.history) messages.push(toOpenAIMessage(m));
  }
  if (request.userMessage) {
    messages.push({ role: "user", content: request.userMessage });
  }
  return messages;
}

/**
 * Extrae y normaliza los tool_calls de una respuesta OpenAI-compatible al
 * formato LLMToolCall del proxy.
 */
function parseOpenAIToolCalls(message: any): LLMToolCall[] | undefined {
  const raw = message?.tool_calls;
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  return raw
    .filter((tc: any) => tc?.function?.name)
    .map((tc: any) => ({
      id: tc.id || `call_${Math.random().toString(36).slice(2)}`,
      type: "function" as const,
      function: {
        name: tc.function.name,
        arguments: typeof tc.function.arguments === "string"
          ? tc.function.arguments
          : JSON.stringify(tc.function.arguments ?? {}),
      },
    }));
}

/** Agrega tools/tool_choice al body OpenAI-compatible si la petición las trae. */
function withOpenAITools(body: Record<string, unknown>, request: LLMRequest): Record<string, unknown> {
  if (request.tools && request.tools.length > 0) {
    body.tools = request.tools;
    body.tool_choice = request.toolChoice ?? "auto";
  }
  return body;
}

// ─── Z.ai (OpenAI-compatible format) ─────────────────────────────────────────
async function callZai(config: LLMConfig, request: LLMRequest): Promise<LLMResponse> {
  const url = `${config.baseUrl}/chat/completions`;

  const body = withOpenAITools(
    {
      model: config.model,
      messages: buildOpenAIMessages(request),
      max_tokens: request.maxTokens || 8192,
      temperature: request.temperature ?? 0.7,
    },
    request
  );

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const msg = err.error?.message || res.statusText;
    const e = new Error(`Z.ai API ${res.status}: ${msg}`);
    // Attach status so caller can decide whether to fall back.
    (e as Error & { status?: number }).status = res.status;
    throw e;
  }

  const data = await res.json();
  const message = data.choices?.[0]?.message || {};
  const text = message.content || "";
  const toolCalls = parseOpenAIToolCalls(message);

  if (!text.trim() && !toolCalls) {
    throw new Error("Z.ai returned empty response");
  }

  return {
    text,
    provider: "zai",
    model: config.model,
    usage: {
      promptTokens: data.usage?.prompt_tokens || 0,
      completionTokens: data.usage?.completion_tokens || 0,
      totalTokens: data.usage?.total_tokens || 0,
    },
    ...(toolCalls ? { toolCalls } : {}),
  };
}

// ─── Gemini (Google format) ──────────────────────────────────────────────────
async function callGemini(config: LLMConfig, request: LLMRequest): Promise<LLMResponse> {
  const url = `${config.baseUrl}/models/${config.model}:generateContent?key=${config.apiKey}`;

  // Gemini uses "contents" for the conversation and "systemInstruction" for the system prompt.
  // Roles: "user" and "model" (not "assistant"). Para function calling usa
  // parts con functionCall (del modelo) y functionResponse (del caller).
  const contents: Array<{ role: string; parts: any[] }> = [];

  if (request.history) {
    for (const msg of request.history) {
      if (msg.role === "assistant" && msg.tool_calls && msg.tool_calls.length > 0) {
        // Turno del modelo que pidió ejecutar funciones.
        contents.push({
          role: "model",
          parts: msg.tool_calls.map((tc) => ({
            functionCall: {
              name: tc.function.name,
              args: safeParseArgs(tc.function.arguments),
            },
          })),
        });
      } else if (msg.role === "tool") {
        // Resultado de una función devuelto al modelo.
        contents.push({
          role: "function",
          parts: [
            {
              functionResponse: {
                name: msg.name || "function",
                response: { result: msg.content },
              },
            },
          ],
        });
      } else {
        contents.push({
          role: msg.role === "assistant" ? "model" : "user",
          parts: [{ text: msg.content }],
        });
      }
    }
  }

  if (request.userMessage) {
    contents.push({ role: "user", parts: [{ text: request.userMessage }] });
  }

  const body: Record<string, unknown> = {
    systemInstruction: { parts: [{ text: request.systemPrompt }] },
    contents,
    generationConfig: {
      maxOutputTokens: request.maxTokens || 8192,
      temperature: request.temperature ?? 0.7,
    },
  };

  // function calling: traducir tools (formato OpenAI) → functionDeclarations.
  if (request.tools && request.tools.length > 0) {
    body.tools = [
      {
        functionDeclarations: request.tools.map((t) => ({
          name: t.function.name,
          description: t.function.description,
          parameters: t.function.parameters,
        })),
      },
    ];
    const tc = request.toolChoice;
    if (tc === "none") {
      body.toolConfig = { functionCallingConfig: { mode: "NONE" } };
    } else if (tc && typeof tc === "object") {
      body.toolConfig = {
        functionCallingConfig: { mode: "ANY", allowedFunctionNames: [tc.function.name] },
      };
    } else {
      body.toolConfig = { functionCallingConfig: { mode: "AUTO" } };
    }
  }

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const msg = err.error?.message || res.statusText;
    const e = new Error(`Gemini API ${res.status}: ${msg}`);
    (e as Error & { status?: number }).status = res.status;
    throw e;
  }

  const data = await res.json();
  const parts = data.candidates?.[0]?.content?.parts || [];

  // Texto: concatenar todas las partes de texto.
  const text = parts
    .map((p: any) => (typeof p.text === "string" ? p.text : ""))
    .join("")
    .trim();

  // Tool calls: convertir functionCall → formato LLMToolCall normalizado.
  const fnParts = parts.filter((p: any) => p.functionCall);
  const toolCalls: LLMToolCall[] | undefined =
    fnParts.length > 0
      ? fnParts.map((p: any, i: number) => ({
          id: `call_${Date.now()}_${i}`,
          type: "function" as const,
          function: {
            name: p.functionCall.name,
            arguments: JSON.stringify(p.functionCall.args ?? {}),
          },
        }))
      : undefined;

  if (!text && !toolCalls) {
    throw new Error("Gemini returned empty response");
  }

  return {
    text,
    provider: "gemini",
    model: config.model,
    usage: {
      promptTokens: data.usageMetadata?.promptTokenCount || 0,
      completionTokens: data.usageMetadata?.candidatesTokenCount || 0,
      totalTokens: data.usageMetadata?.totalTokenCount || 0,
    },
    ...(toolCalls ? { toolCalls } : {}),
  };
}

/** Parsea args JSON de forma segura; si falla, devuelve objeto vacío. */
function safeParseArgs(argsStr: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(argsStr);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

// OpenAI API (OpenAI-compatible format, same as Z.ai)
async function callOpenAI(config: LLMConfig, request: LLMRequest): Promise<LLMResponse> {
  const url = `${config.baseUrl}/chat/completions`;

  const body = withOpenAITools(
    {
      model: config.model,
      messages: buildOpenAIMessages(request),
      max_tokens: request.maxTokens || 8192,
      temperature: request.temperature ?? 0.7,
    },
    request
  );

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`OpenAI API ${res.status}: ${err.error?.message || res.statusText}`);
  }

  const data = await res.json();
  const message = data.choices?.[0]?.message || {};
  const text = message.content || "";
  const toolCalls = parseOpenAIToolCalls(message);

  return {
    text,
    provider: "openai",
    model: config.model,
    usage: {
      promptTokens: data.usage?.prompt_tokens || 0,
      completionTokens: data.usage?.completion_tokens || 0,
      totalTokens: data.usage?.total_tokens || 0,
    },
    ...(toolCalls ? { toolCalls } : {}),
  };
}



// ─── DeepSeek (OpenAI-compatible format) ─────────────────────────────────────
// Handler para proveedores con API compatible con OpenAI (/chat/completions):
// DeepSeek, Groq, OpenRouter y Mistral usan este mismo formato.
async function callOpenAICompatible(config: LLMConfig, request: LLMRequest): Promise<LLMResponse> {
  const url = `${config.baseUrl}/chat/completions`;

  const body = withOpenAITools(
    {
      model: config.model,
      messages: buildOpenAIMessages(request),
      max_tokens: request.maxTokens || 8192,
      temperature: request.temperature ?? 0.7,
    },
    request
  );

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const msg = err.error?.message || res.statusText;
    const e = new Error(`${config.provider} API ${res.status}: ${msg}`);
    (e as Error & { status?: number }).status = res.status;
    throw e;
  }

  const data = await res.json();
  const message = data.choices?.[0]?.message || {};
  const text = message.content || "";
  const toolCalls = parseOpenAIToolCalls(message);

  // Con tools, una respuesta válida puede traer SOLO tool_calls (content vacío).
  if (!text.trim() && !toolCalls) {
    throw new Error(`${config.provider} returned empty response`);
  }

  return {
    text,
    provider: config.provider,
    model: config.model,
    usage: {
      promptTokens: data.usage?.prompt_tokens || 0,
      completionTokens: data.usage?.completion_tokens || 0,
      totalTokens: data.usage?.total_tokens || 0,
    },
    ...(toolCalls ? { toolCalls } : {}),
  };
}
