// LLM client: provider-agnostic call function with chained fallback.
// Uses plain fetch — works on Vercel, no SDK auto-injection needed.
// DEC-LOGAN-006: provider independence.
// DEC-LOGAN-017: per-task preference chain — tries best model first, falls
//                back to cheaper/worse on error, never blocks on a single model.

import type { LLMConfig, LLMRequest, LLMResponse, LLMMessage } from "./types";
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

export async function callLLM(request: LLMRequest): Promise<LLMResponse> {
  const options = getLLMConfigWithFallback(request.task);
  if (options.length === 0) {
    throw new Error(
      "No LLM provider available. Set ZAI_API_KEY or GEMINI_API_KEY.",
    );
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
      } else if (config.provider === "deepseek") {
        return await callDeepSeek(config, request);
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

// ─── Z.ai (OpenAI-compatible format) ─────────────────────────────────────────
async function callZai(config: LLMConfig, request: LLMRequest): Promise<LLMResponse> {
  const url = `${config.baseUrl}/chat/completions`;

  const messages: LLMMessage[] = [
    { role: "system", content: request.systemPrompt },
  ];

  // Add conversation history if provided (for multi-turn chat)
  if (request.history && request.history.length > 0) {
    messages.push(...request.history);
  }

  messages.push({ role: "user", content: request.userMessage });

  const body = {
    model: config.model,
    messages,
    max_tokens: request.maxTokens || 8192,
    temperature: request.temperature ?? 0.7,
  };

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
  const text = data.choices?.[0]?.message?.content || "";

  if (!text.trim()) {
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
  };
}

// ─── Gemini (Google format) ──────────────────────────────────────────────────
async function callGemini(config: LLMConfig, request: LLMRequest): Promise<LLMResponse> {
  const url = `${config.baseUrl}/models/${config.model}:generateContent?key=${config.apiKey}`;

  // Gemini uses "contents" for the conversation and "systemInstruction" for the system prompt.
  // Roles: "user" and "model" (not "assistant").
  const contents: Array<{ role: string; parts: Array<{ text: string }> }> = [];

  // Add history if provided (convert assistant → model)
  if (request.history) {
    for (const msg of request.history) {
      contents.push({
        role: msg.role === "assistant" ? "model" : "user",
        parts: [{ text: msg.content }],
      });
    }
  }

  // Add the current user message
  contents.push({ role: "user", parts: [{ text: request.userMessage }] });

  const body = {
    systemInstruction: { parts: [{ text: request.systemPrompt }] },
    contents,
    generationConfig: {
      maxOutputTokens: request.maxTokens || 8192,
      temperature: request.temperature ?? 0.7,
    },
  };

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
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";

  if (!text.trim()) {
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
  };
}

// OpenAI API (OpenAI-compatible format, same as Z.ai)
async function callOpenAI(config: LLMConfig, request: LLMRequest): Promise<LLMResponse> {
  const url = `${config.baseUrl}/chat/completions`;

  const messages: LLMMessage[] = [
    { role: "system", content: request.systemPrompt },
  ];

  if (request.history && request.history.length > 0) {
    messages.push(...request.history);
  }

  messages.push({ role: "user", content: request.userMessage });

  const body = {
    model: config.model,
    messages,
    max_tokens: request.maxTokens || 8192,
    temperature: request.temperature ?? 0.7,
  };

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
  const text = data.choices?.[0]?.message?.content || "";

  return {
    text,
    provider: "openai",
    model: config.model,
    usage: {
      promptTokens: data.usage?.prompt_tokens || 0,
      completionTokens: data.usage?.completion_tokens || 0,
      totalTokens: data.usage?.total_tokens || 0,
    },
  };
}



// ─── DeepSeek (OpenAI-compatible format) ─────────────────────────────────────
async function callDeepSeek(config: LLMConfig, request: LLMRequest): Promise<LLMResponse> {
  const url = `${config.baseUrl}/chat/completions`;

  const messages: LLMMessage[] = [
    { role: "system", content: request.systemPrompt },
  ];

  if (request.history && request.history.length > 0) {
    messages.push(...request.history);
  }

  messages.push({ role: "user", content: request.userMessage });

  const body = {
    model: config.model,
    messages,
    max_tokens: request.maxTokens || 8192,
    temperature: request.temperature ?? 0.7,
  };

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
    const e = new Error(`DeepSeek API ${res.status}: ${msg}`);
    (e as Error & { status?: number }).status = res.status;
    throw e;
  }

  const data = await res.json();
  const text = data.choices?.[0]?.message?.content || "";

  if (!text.trim()) {
    throw new Error("DeepSeek returned empty response");
  }

  return {
    text,
    provider: "deepseek",
    model: config.model,
    usage: {
      promptTokens: data.usage?.prompt_tokens || 0,
      completionTokens: data.usage?.completion_tokens || 0,
      totalTokens: data.usage?.total_tokens || 0,
    },
  };
}
