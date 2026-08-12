// LLM configuration: per-task provider + model selection.
// DEC-LOGAN-006: independence del proveedor.
// getLLMConfigWithFallback returns an ARRAY of options (best first) for the
// fallback chain in client.ts.

import type { LLMConfig, LLMTask, LLMProvider } from "./types";

const TASK_MODEL_MAP: Record<LLMTask, { provider: LLMProvider; model: string }> = {
  core_decide:     { provider: "zai", model: "glm-5.2" },
  core_integrate:  { provider: "zai", model: "glm-5.2" },
  dev:             { provider: "zai", model: "glm-5.2" },
  design:          { provider: "zai", model: "glm-5.1" },
  analytics:       { provider: "zai", model: "glm-5.1" },
  legal:           { provider: "zai", model: "glm-5.1" },
  validator:       { provider: "zai", model: "glm-5-turbo" },
  marketing:       { provider: "zai", model: "glm-5-turbo" },
  finance:         { provider: "zai", model: "glm-5-turbo" },
  support:         { provider: "zai", model: "glm-5-turbo" },
  assistant:       { provider: "zai", model: "glm-5-turbo" },
  showcase:        { provider: "zai", model: "glm-5-turbo" },
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

  if (isProviderAvailable(primary.provider)) {
    options.push(primary);
  }

  // Add fallback: if primary is zai, try gemini. If primary is gemini, try zai.
  if (primary.provider === "zai" && isProviderAvailable("gemini")) {
    options.push(buildConfig("gemini", "gemini-2.0-flash"));
  }
  if (primary.provider === "gemini" && isProviderAvailable("zai")) {
    options.push(buildConfig("zai", "glm-4.6"));
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
