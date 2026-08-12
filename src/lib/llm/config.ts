// LLM configuration: per-task provider + model selection.
// DEC-LOGAN-006: independence del proveedor.

import type { LLMConfig, LLMTask, LLMProvider } from "./types";

const TASK_MODEL_MAP: Record<LLMTask, { provider: LLMProvider; model: string }> = {
  // GLM-5.2 — máxima calidad
  core_decide:     { provider: "zai", model: "glm-5.2" },
  core_integrate:  { provider: "zai", model: "glm-5.2" },
  dev:             { provider: "zai", model: "glm-5.2" },
  // GLM-5.1 — buena calidad
  design:          { provider: "zai", model: "glm-5.1" },
  analytics:       { provider: "zai", model: "glm-5.1" },
  legal:           { provider: "zai", model: "glm-5.1" },
  // GLM-5-turbo — barato
  validator:       { provider: "zai", model: "glm-5-turbo" },
  marketing:       { provider: "zai", model: "glm-5-turbo" },
  finance:         { provider: "zai", model: "glm-5-turbo" },
  support:         { provider: "zai", model: "glm-5-turbo" },
  assistant:       { provider: "zai", model: "glm-5-turbo" },
  showcase:        { provider: "zai", model: "glm-5-turbo" },
};

export function getLLMConfig(task: LLMTask): LLMConfig {
  const mapping = TASK_MODEL_MAP[task];
  if (mapping.provider === "zai") {
    return { provider: "zai", model: mapping.model, apiKey: process.env.ZAI_API_KEY || "", baseUrl: "https://api.z.ai/api/paas/v4" };
  }
  if (mapping.provider === "gemini") {
    return { provider: "gemini", model: mapping.model, apiKey: process.env.GEMINI_API_KEY || "", baseUrl: "https://generativelanguage.googleapis.com/v1beta" };
  }
  throw new Error(`Unknown provider: ${mapping.provider}`);
}

export function isProviderAvailable(provider: LLMProvider): boolean {
  if (provider === "zai") return !!process.env.ZAI_API_KEY;
  if (provider === "gemini") return !!process.env.GEMINI_API_KEY;
  return false;
}

export function getLLMConfigWithFallback(task: LLMTask): LLMConfig {
  const primary = getLLMConfig(task);
  if (isProviderAvailable(primary.provider)) return primary;
  if (primary.provider === "zai" && isProviderAvailable("gemini")) {
    return { provider: "gemini", model: "gemini-2.0-flash", apiKey: process.env.GEMINI_API_KEY || "", baseUrl: "https://generativelanguage.googleapis.com/v1beta" };
  }
  if (primary.provider === "gemini" && isProviderAvailable("zai")) {
    return { provider: "zai", model: "glm-4.6", apiKey: process.env.ZAI_API_KEY || "", baseUrl: "https://api.z.ai/api/paas/v4" };
  }
  throw new Error("No LLM provider available. Set ZAI_API_KEY or GEMINI_API_KEY.");
}
