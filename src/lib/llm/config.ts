// LLM configuration: 3 providers with fallback chain.
// Z.ai (primario) → Gemini (secundario) → OpenAI (terciario).
// DEC-LOGAN-006: independence del proveedor.

import type { LLMConfig, LLMTask, LLMProvider } from "./types";

const TASK_MODEL_MAP: Record<LLMTask, { provider: LLMProvider; model: string }> = {
  core_decide:     { provider: "zai", model: "glm-5-turbo" },
  core_integrate:  { provider: "zai", model: "glm-5-turbo" },
  dev:             { provider: "zai", model: "glm-5.2" },
  design:          { provider: "gemini", model: "gemini-flash-latest" },
  analytics:       { provider: "gemini", model: "gemini-flash-latest" },
  legal:           { provider: "gemini", model: "gemini-flash-latest" },
  validator:       { provider: "gemini", model: "gemini-flash-latest" },
  marketing:       { provider: "gemini", model: "gemini-flash-latest" },
  finance:         { provider: "gemini", model: "gemini-flash-latest" },
  support:         { provider: "gemini", model: "gemini-flash-latest" },
  assistant:       { provider: "deepseek", model: "deepseek-chat" },
  showcase:        { provider: "gemini", model: "gemini-flash-latest" },
};

export function getLLMConfig(task: LLMTask): LLMConfig {
  const mapping = TASK_MODEL_MAP[task];
  return buildConfig(mapping.provider, mapping.model);
}

export function isProviderAvailable(provider: LLMProvider): boolean {
  if (provider === "zai") return !!process.env.ZAI_API_KEY;
  if (provider === "gemini") return !!process.env.GEMINI_API_KEY;
  if (provider === "openai") return !!process.env.OPENAI_API_KEY;
  if (provider === "deepseek") return !!process.env.DEEPSEEK_API_KEY;
  return false;
}

// Returns an ARRAY of options for the fallback chain.
// Order: primary → secondary → tertiary
export function getLLMConfigWithFallback(task: LLMTask): LLMConfig[] {
  const primary = getLLMConfig(task);
  const options: LLMConfig[] = [];

  if (isProviderAvailable(primary.provider)) {
    options.push(primary);
  }

  // Fallback chain: try all providers that are available
  if (primary.provider !== "zai" && isProviderAvailable("zai")) {
    options.push(buildConfig("zai", "glm-5-turbo"));
  }
  if (primary.provider !== "gemini" && isProviderAvailable("gemini")) {
    options.push(buildConfig("gemini", "gemini-flash-latest"));
  }
  if (primary.provider !== "deepseek" && isProviderAvailable("deepseek")) {
    options.push(buildConfig("deepseek", "deepseek-chat"));
  }
  if (primary.provider !== "openai" && isProviderAvailable("openai")) {
    options.push(buildConfig("openai", "gpt-4o-mini"));
  }

  return options;
}

function buildConfig(provider: LLMProvider, model: string): LLMConfig {
  if (provider === "zai") {
    return { provider, model, apiKey: process.env.ZAI_API_KEY || "", baseUrl: "https://api.z.ai/api/paas/v4" };
  }
  if (provider === "gemini") {
    return { provider, model, apiKey: process.env.GEMINI_API_KEY || "", baseUrl: "https://generativelanguage.googleapis.com/v1beta" };
  }
  if (provider === "openai") {
    return { provider, model, apiKey: process.env.OPENAI_API_KEY || "", baseUrl: "https://api.openai.com/v1" };
  }
  if (provider === "deepseek") {
    return { provider, model, apiKey: process.env.DEEPSEEK_API_KEY || "", baseUrl: "https://api.deepseek.com" };
  }
  throw new Error(`Unknown provider: ${provider}`);
}
