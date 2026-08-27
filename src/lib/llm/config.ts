// LLM configuration: 4 providers with fallback chain.
// DeepSeek primario (más barato) → Z.ai → Gemini → OpenAI.
// DEC-LOGAN-006: independence del proveedor.

import type { LLMConfig, LLMTask, LLMProvider } from "./types";

// DeepSeek como primario (muy barato, buena calidad)
// Z.ai como secundario (GLM-5.2 para Dev — mejor código)
// Gemini como terciario (gratis)
// OpenAI como último recurso
const TASK_MODEL_MAP: Record<LLMTask, { provider: LLMProvider; model: string }> = {
  core_decide:     { provider: "deepseek", model: "deepseek-chat" },
  core_integrate:  { provider: "deepseek", model: "deepseek-chat" },
  dev:             { provider: "zai", model: "glm-5.2" },
  design:          { provider: "deepseek", model: "deepseek-chat" },
  analytics:       { provider: "deepseek", model: "deepseek-chat" },
  legal:           { provider: "deepseek", model: "deepseek-chat" },
  validator:       { provider: "deepseek", model: "deepseek-chat" },
  marketing:       { provider: "deepseek", model: "deepseek-chat" },
  finance:         { provider: "deepseek", model: "deepseek-chat" },
  support:         { provider: "deepseek", model: "deepseek-chat" },
  assistant:       { provider: "deepseek", model: "deepseek-chat" },
  showcase:        { provider: "deepseek", model: "deepseek-chat" },
};

export function getLLMConfig(task: LLMTask): LLMConfig {
  const mapping = TASK_MODEL_MAP[task];
  return buildConfig(mapping.provider, mapping.model);
}

export function isProviderAvailable(provider: LLMProvider): boolean {
  if (provider === "deepseek") return !!process.env.DEEPSEEK_API_KEY;
  if (provider === "zai") return !!process.env.ZAI_API_KEY;
  if (provider === "gemini") return !!process.env.GEMINI_API_KEY;
  if (provider === "openai") return !!process.env.OPENAI_API_KEY;
  return false;
}

// Fallback chain: DeepSeek → Z.ai → Gemini → OpenAI
export function getLLMConfigWithFallback(task: LLMTask): LLMConfig[] {
  const primary = getLLMConfig(task);
  const options: LLMConfig[] = [];

  if (isProviderAvailable(primary.provider)) {
    options.push(primary);
  }

  // Fallback en orden de costo: Z.ai → Gemini (gratis) → OpenAI
  if (primary.provider !== "zai" && isProviderAvailable("zai")) {
    options.push(buildConfig("zai", "glm-5-turbo"));
  }
  if (primary.provider !== "gemini" && isProviderAvailable("gemini")) {
    options.push(buildConfig("gemini", "gemini-flash-latest"));
  }
  if (primary.provider !== "openai" && isProviderAvailable("openai")) {
    options.push(buildConfig("openai", "gpt-4o-mini"));
  }

  return options;
}

function buildConfig(provider: LLMProvider, model: string): LLMConfig {
  if (provider === "deepseek") {
    return { provider, model, apiKey: process.env.DEEPSEEK_API_KEY || "", baseUrl: "https://api.deepseek.com/v1" };
  }
  if (provider === "zai") {
    return { provider, model, apiKey: process.env.ZAI_API_KEY || "", baseUrl: "https://api.z.ai/api/paas/v4" };
  }
  if (provider === "gemini") {
    return { provider, model, apiKey: process.env.GEMINI_API_KEY || "", baseUrl: "https://generativelanguage.googleapis.com/v1beta" };
  }
  if (provider === "openai") {
    return { provider, model, apiKey: process.env.OPENAI_API_KEY || "", baseUrl: "https://api.openai.com/v1" };
  }
  throw new Error(`Unknown provider: ${provider}`);
}
