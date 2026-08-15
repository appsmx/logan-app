// LLM configuration: per-task provider + model selection.
// DEC-LOGAN-006: independence del proveedor.
// Ahora: Gemini como primario (gratis), Z.ai como fallback (cuando haya créditos).

import type { LLMConfig, LLMTask, LLMProvider } from "./types";

// Gemini es primario (gratis, 1500 req/día free tier)
// Z.ai es fallback (cuando tenga créditos, mejor calidad)
const TASK_MODEL_MAP: Record<LLMTask, { provider: LLMProvider; model: string }> = {
  core_decide:     { provider: "gemini", model: "gemini-flash-latest" },
  core_integrate:  { provider: "gemini", model: "gemini-flash-latest" },
  dev:             { provider: "zai", model: "glm-5.2" },
  design:          { provider: "gemini", model: "gemini-flash-latest" },
  analytics:       { provider: "gemini", model: "gemini-flash-latest" },
  legal:           { provider: "gemini", model: "gemini-flash-latest" },
  validator:       { provider: "gemini", model: "gemini-flash-latest" },
  marketing:       { provider: "gemini", model: "gemini-flash-latest" },
  finance:         { provider: "gemini", model: "gemini-flash-latest" },
  support:         { provider: "gemini", model: "gemini-flash-latest" },
  assistant:       { provider: "gemini", model: "gemini-flash-latest" },
  showcase:        { provider: "gemini", model: "gemini-flash-latest" },
};

export function getLLMConfig(task: LLMTask): LLMConfig {
  const mapping = TASK_MODEL_MAP[task];
  return buildConfig(mapping.provider, mapping.model);
}

export function isProviderAvailable(provider: LLMProvider): boolean {
  if (provider === "zai") return !!process.env.ZAI_API_KEY;
  if (provider === "gemini") return !!process.env.GEMINI_API_KEY;
  return false;
}

// Returns an ARRAY of options (best first) for the fallback chain.
export function getLLMConfigWithFallback(task: LLMTask): LLMConfig[] {
  const primary = getLLMConfig(task);
  const options: LLMConfig[] = [];

  // Primario
  if (isProviderAvailable(primary.provider)) {
    options.push(primary);
  }

  // Fallback: el otro proveedor
  if (primary.provider === "gemini" && isProviderAvailable("zai")) {
    options.push(buildConfig("zai", "glm-5-turbo"));
  }
  if (primary.provider === "zai" && isProviderAvailable("gemini")) {
    options.push(buildConfig("gemini", "gemini-flash-latest"));
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
  throw new Error(`Unknown provider: ${provider}`);
}
