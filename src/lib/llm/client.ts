// LOGAN LLM — provider-agnostic client.
//
// The ONE function the rest of LOGAN calls: `callLLM(request)`. It picks the
// provider based on `request.task` (via `TASK_MODEL_MAP` in config.ts) and
// dispatches to the appropriate `callXxx` implementation.
//
// Provider implementations:
//   - callGemini  → Google Generative Language API (v1beta).
//   - callZai     → Z.ai OpenAI-compatible /chat/completions endpoint.
//
// Both implementations return the same `LLMResponse` shape so callers don't
// care which provider actually ran.
//
// Critical API-format notes (got these wrong once — do NOT regress):
//   - Gemini uses `contents` + `parts` + `systemInstruction`, and uses "model"
//     (not "assistant") as the assistant role label.
//   - Z.ai is OpenAI-compatible: `messages` + `choices`, role "assistant".
//
// Comments in English. Error surfaces in Spanish (user-facing).

import type { LLMConfig, LLMRequest, LLMResponse } from "./types";
import { getLLMConfigWithFallback } from "./config";

/**
 * Calls the LLM for `request.task`, dispatching to the right provider.
 *
 * Throws on any failure (bad status, empty response, parse error). Callers
 * are expected to wrap this in try/catch and return a 503 / fallback.
 *
 * @example
 *   const res = await callLLM({
 *     task: "validator",
 *     systemPrompt: "Eres el validador…",
 *     userMessage: "…",
 *   });
 *   const text = res.text;
 */
export async function callLLM(request: LLMRequest): Promise<LLMResponse> {
  const config = getLLMConfigWithFallback(request.task);

  if (config.provider === "gemini") return callGemini(config, request);
  if (config.provider === "zai") return callZai(config, request);

  // Exhaustiveness — should never happen.
  throw new Error(`Proveedor LLM desconocido: ${config.provider}`);
}

// ─── Gemini ─────────────────────────────────────────────────────────────────
//
// POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={apiKey}
//
// Body shape (NOT OpenAI-style — Gemini uses `contents` + `parts`):
//   {
//     systemInstruction: { parts: [{ text: "..." }] },
//     contents: [
//       { role: "user",      parts: [{ text: "..." }] },
//       { role: "model",     parts: [{ text: "..." }] },   // ← "model", not "assistant"
//       ...
//     ],
//     generationConfig: { maxOutputTokens, temperature }
//   }
//
// Response shape:
//   {
//     candidates: [{ content: { parts: [{ text: "..." }] } }],
//     usageMetadata: { promptTokenCount, candidatesTokenCount, totalTokenCount }
//   }
async function callGemini(config: LLMConfig, request: LLMRequest): Promise<LLMResponse> {
  if (!config.apiKey) {
    throw new Error("GEMINI_API_KEY no configurada");
  }

  // Build the contents array. Gemini roles are "user" / "model" (NOT "assistant").
  const contents: Array<{ role: "user" | "model"; parts: Array<{ text: string }> }> = [];

  // Replay optional multi-turn history.
  if (request.history?.length) {
    for (const turn of request.history) {
      // Skip "system" entries in history — Gemini puts system content in
      // systemInstruction, not contents. (No caller currently sends system
      // in history, but be defensive.)
      if (turn.role === "system") continue;
      contents.push({
        role: turn.role === "assistant" ? "model" : "user",
        parts: [{ text: turn.content }],
      });
    }
  }

  // The new user message goes last.
  contents.push({ role: "user", parts: [{ text: request.userMessage }] });

  const url = `${config.baseUrl}/models/${config.model}:generateContent?key=${encodeURIComponent(config.apiKey)}`;
  const body = {
    systemInstruction: { parts: [{ text: request.systemPrompt }] },
    contents,
    generationConfig: {
      maxOutputTokens: request.maxTokens ?? 8192,
      temperature: request.temperature ?? 0.7,
    },
  };

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (e) {
    throw new Error(`Gemini no responde: ${(e as Error).message}`);
  }

  if (!res.ok) {
    let msg = res.statusText;
    try {
      const err = (await res.json()) as { error?: { message?: string } };
      if (err?.error?.message) msg = err.error.message;
    } catch {
      // ignore JSON parse errors
    }
    throw new Error(`Gemini API ${res.status}: ${msg}`);
  }

  const data = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    usageMetadata?: {
      promptTokenCount?: number;
      candidatesTokenCount?: number;
      totalTokenCount?: number;
    };
  };

  const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  if (!text) {
    throw new Error("Gemini devolvió una respuesta vacía");
  }

  return {
    text,
    provider: "gemini",
    model: config.model,
    usage: {
      promptTokens: data.usageMetadata?.promptTokenCount ?? 0,
      completionTokens: data.usageMetadata?.candidatesTokenCount ?? 0,
      totalTokens: data.usageMetadata?.totalTokenCount ?? 0,
    },
  };
}

// ─── Z.ai (OpenAI-compatible) ────────────────────────────────────────────────
//
// POST https://api.z.ai/api/paas/v4/chat/completions
//
// Body shape (OpenAI-compatible):
//   {
//     model: "glm-4.6",
//     messages: [
//       { role: "system",    content: "..." },
//       { role: "user",      content: "..." },
//       { role: "assistant", content: "..." },   // multi-turn history
//       ...
//     ],
//     max_tokens, temperature
//   }
//
// Auth: Bearer {apiKey}
//
// Response shape (OpenAI-compatible):
//   {
//     choices: [{ message: { content: "..." } }],
//     usage: { prompt_tokens, completion_tokens, total_tokens }
//   }
async function callZai(config: LLMConfig, request: LLMRequest): Promise<LLMResponse> {
  if (!config.apiKey) {
    throw new Error("ZAI_API_KEY no configurada");
  }

  // Build the messages array: system first, then optional history, then the
  // new user message. Roles are "user" / "assistant" / "system".
  const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
    { role: "system", content: request.systemPrompt },
  ];
  if (request.history?.length) {
    for (const turn of request.history) {
      messages.push({ role: turn.role, content: turn.content });
    }
  }
  messages.push({ role: "user", content: request.userMessage });

  const url = `${config.baseUrl}/chat/completions`;
  const body = {
    model: config.model,
    messages,
    max_tokens: request.maxTokens ?? 8192,
    temperature: request.temperature ?? 0.7,
  };

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify(body),
    });
  } catch (e) {
    throw new Error(`Z.ai no responde: ${(e as Error).message}`);
  }

  if (!res.ok) {
    let msg = res.statusText;
    try {
      const err = (await res.json()) as { error?: { message?: string } };
      if (err?.error?.message) msg = err.error.message;
    } catch {
      // ignore JSON parse errors
    }
    throw new Error(`Z.ai API ${res.status}: ${msg}`);
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
  };

  const text = data.choices?.[0]?.message?.content ?? "";
  if (!text) {
    throw new Error("Z.ai devolvió una respuesta vacía");
  }

  return {
    text,
    provider: "zai",
    model: config.model,
    usage: {
      promptTokens: data.usage?.prompt_tokens ?? 0,
      completionTokens: data.usage?.completion_tokens ?? 0,
      totalTokens: data.usage?.total_tokens ?? 0,
    },
  };
}
