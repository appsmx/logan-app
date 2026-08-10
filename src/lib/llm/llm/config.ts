// LLM configuration: per-task provider + model selection.
// DEC-LOGAN-006: independence del proveedor.
// Each task can use a different model — e.g. Z.ai GLM-4.6 for code, Gemini Flash for chat.

import type { LLMConfig, LLMTask, LLMProvider } from "./types";

// Task → model mapping. Each task can use a different provider + model.
// Default: Z.ai GLM-4.6 (user has credits, best quality for the price).
// When the user wants to use Gemini for specific tasks (e.g. customer-facing chat
// where Gemini Flash is cheaper), they edit this map.
const TASK_MODEL_MAP: Record<LLMTask, { provider: LLMProvider; model: string }> = {
  core_decide:     { provider: "zai", model: "glm-4.6" },
  core_integrate:  { provider: "zai", model: "glm-4.6" },
  validator:       { provider: "zai", model: "glm-4.6" },
  marketing:       { provider: "zai", model: "glm-4.6" },
  dev:             { provider: "zai", model: "glm-4.6" },
  design:          { provider: "zai", model: "glm-4.6" },
  analytics:       { provider: "zai", model: "glm-4.6" },
  finance:         { provider: "zai", model: "glm-4.6" },
  legal:           { provider: "zai", model: "glm-4.6" },
  support:         { provider: "zai", model: "glm-4.6" },
  assistant:       { provider: "zai", model: "glm-4.6" },
  showcase:        { provider: "zai", model: "glm-4.6" },
};

export function getLLMConfig(task: LLMTask): LLMConfig {
  const mapping = TASK_MODEL_MAP[task];

  if (mapping.provider === "zai") {
    return {
      provider: "zai",
      model: mapping.model,
      apiKey: process.env.ZAI_API_KEY || "",
      baseUrl: "https://api.z.ai/api/paas/v4",
    };
  }

  if (mapping.provider === "gemini") {
    return {
      provider: "gemini",
      model: mapping.model,
      apiKey: process.env.GEMINI_API_KEY || "",
      baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    };
  }

  throw new Error(`Unknown provider: ${mapping.provider}`);
}

// Check if a provider is available (has API key).
export function isProviderAvailable(provider: LLMProvider): boolean {
  if (provider === "zai") return !!process.env.ZAI_API_KEY;
  if (provider === "gemini") return !!process.env.GEMINI_API_KEY;
  return false;
}

// Fallback: if primary provider unavailable, use the other.
export function getLLMConfigWithFallback(task: LLMTask): LLMConfig {
  const primary = getLLMConfig(task);
  if (isProviderAvailable(primary.provider)) return primary;

  // If primary not available, try the other provider.
  if (primary.provider === "zai" && isProviderAvailable("gemini")) {
    return {
      provider: "gemini",
      model: "gemini-2.0-flash",
      apiKey: process.env.GEMINI_API_KEY || "",
      baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    };
  }
  if (primary.provider === "gemini" && isProviderAvailable("zai")) {
    return {
      provider: "zai",
      model: "glm-4.6",
      apiKey: process.env.ZAI_API_KEY || "",
      baseUrl: "https://api.z.ai/api/paas/v4",
    };
  }

  throw new Error("No LLM provider available. Set ZAI_API_KEY or GEMINI_API_KEY.");
}
