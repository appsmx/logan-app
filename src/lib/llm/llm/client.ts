// LLM client: provider-agnostic call function.
// Uses plain fetch — works on Vercel, no SDK auto-injection needed.

import type { LLMConfig, LLMRequest, LLMResponse, LLMMessage } from "./types";
import { getLLMConfigWithFallback } from "./config";

export async function callLLM(request: LLMRequest): Promise<LLMResponse> {
  const config = getLLMConfigWithFallback(request.task);

  if (config.provider === "zai") {
    return callZai(config, request);
  } else if (config.provider === "gemini") {
    return callGemini(config, request);
  }
  throw new Error(`Unknown provider: ${config.provider}`);
}

// Z.ai API (OpenAI-compatible format)
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
    max_tokens: request.maxTokens || 4096,
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
    throw new Error(`Z.ai API ${res.status}: ${err.error?.message || res.statusText}`);
  }

  const data = await res.json();
  const text = data.choices?.[0]?.message?.content || "";

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

// Gemini API (Google format — contents + parts + systemInstruction)
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
      maxOutputTokens: request.maxTokens || 4096,
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
    throw new Error(`Gemini API ${res.status}: ${err.error?.message || res.statusText}`);
  }

  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";

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
