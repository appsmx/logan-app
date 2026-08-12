// LLM configuration: per-task provider + model selection with chained fallback.
// DEC-LOGAN-006: independence del proveedor.
// DEC-LOGAN-017: Mix de modelos GLM-5.2/5.1/5-turbo según criticidad de tarea.
//
// Each task has a PREFERENCE LIST (not a single model). The runtime tries
// each option in order and falls back automatically on:
//   - 401 (bad key)
//   - 403 (forbidden)
//   - 404 (model doesn't exist)
//   - 429 (rate limit / insufficient balance)
//   - 5xx (server error)
//   - network error
//
// The first successful call wins. If all options fail, throw.
//
// Providers are skipped entirely if their API key is not configured.
// Gemini (free tier, 1500 req/day) is always the safety net at the end.

import type { LLMConfig, LLMTask, LLMProvider } from "./types";

// ─── Provider constants ──────────────────────────────────────────────────────
const ZAI_BASE_URL = "https://api.z.ai/api/paas/v4";
const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";

// ─── Task → preference list ─────────────────────────────────────────────────
// Ordered by QUALITY (best first) — runtime falls back to cheaper/worse on error.
//
// GLM-5.2 tier (máxima calidad, ~$5/$15 per 1M tokens):
//   - core_decide, core_integrate, dev
//   These are the places where LOGAN needs to reason deepest. An error here
//   costs the most (bug in production, wrong delegation, etc.).
//
// GLM-5.1 tier (buena calidad, ~$2/$6 per 1M tokens):
//   - design, analytics, legal
//   Need precision (a bad legal analysis is dangerous), but not critical
//   for ecosystem coordination.
//
// GLM-5-turbo tier (rápido y barato, ~$0.1/$0.3 per 1M tokens):
//   - validator, marketing, finance, support, assistant, showcase
//   Customer-facing (latency-sensitive) or simple/routine tasks.
//
// Each tier falls back to GLM-4.6 (mid-tier workhorse, ~$0.5/$1.5 per 1M tokens)
// if the 5.x model is unavailable or out of credits, then to Gemini Flash
// (free tier) as the safety net.
//
// GLM-4-flash is an even cheaper option for the turbo tier (~$0.05/$0.15 per 1M).

type ModelOption = { provider: LLMProvider; model: string };

const TASK_PREFERENCE_MAP: Record<LLMTask, ModelOption[]> = {
  // ─── GLM-5.2 tier (máxima calidad) ───────────────────────────────────────
  core_decide: [
    { provider: "zai", model: "glm-5.2" },
    { provider: "zai", model: "glm-4.6" },
    { provider: "gemini", model: "gemini-2.0-flash" },
  ],
  core_integrate: [
    { provider: "zai", model: "glm-5.2" },
    { provider: "zai", model: "glm-4.6" },
    { provider: "gemini", model: "gemini-2.0-flash" },
  ],
  dev: [
    { provider: "zai", model: "glm-5.2" },
    { provider: "zai", model: "glm-4.6" },
    { provider: "gemini", model: "gemini-2.0-flash" },
  ],

  // ─── GLM-5.1 tier (buena calidad) ────────────────────────────────────────
  design: [
    { provider: "zai", model: "glm-5.1" },
    { provider: "zai", model: "glm-4.6" },
    { provider: "gemini", model: "gemini-2.0-flash" },
  ],
  analytics: [
    { provider: "zai", model: "glm-5.1" },
    { provider: "zai", model: "glm-4.6" },
    { provider: "gemini", model: "gemini-2.0-flash" },
  ],
  legal: [
    { provider: "zai", model: "glm-5.1" },
    { provider: "zai", model: "glm-4.6" },
    { provider: "gemini", model: "gemini-2.0-flash" },
  ],

  // ─── GLM-5-turbo tier (rápido y barato — customer-facing + rutinarias) ─
  validator: [
    { provider: "zai", model: "glm-5-turbo" },
    { provider: "zai", model: "glm-4-flash" },
    { provider: "zai", model: "glm-4.6" },
    { provider: "gemini", model: "gemini-2.0-flash" },
  ],
  marketing: [
    { provider: "zai", model: "glm-5-turbo" },
    { provider: "zai", model: "glm-4-flash" },
    { provider: "zai", model: "glm-4.6" },
    { provider: "gemini", model: "gemini-2.0-flash" },
  ],
  finance: [
    { provider: "zai", model: "glm-5-turbo" },
    { provider: "zai", model: "glm-4-flash" },
    { provider: "zai", model: "glm-4.6" },
    { provider: "gemini", model: "gemini-2.0-flash" },
  ],
  support: [
    { provider: "zai", model: "glm-5-turbo" },
    { provider: "zai", model: "glm-4-flash" },
    { provider: "zai", model: "glm-4.6" },
    { provider: "gemini", model: "gemini-2.0-flash" },
  ],
  assistant: [
    { provider: "zai", model: "glm-5-turbo" },
    { provider: "zai", model: "glm-4-flash" },
    { provider: "gemini", model: "gemini-2.0-flash" },
  ],
  showcase: [
    { provider: "zai", model: "glm-5-turbo" },
    { provider: "zai", model: "glm-4-flash" },
    { provider: "gemini", model: "gemini-2.0-flash" },
  ],
};

// ─── Resolution helpers ──────────────────────────────────────────────────────

function resolveConfig(option: ModelOption): LLMConfig | null {
  if (option.provider === "zai") {
    // Allow loganZAI_API_KEY as an alternative for Vercel projects that want
    // a namespaced env var (multiple projects in the same Vercel team).
    const apiKey =
      process.env.loganZAI_API_KEY || process.env.ZAI_API_KEY;
    if (!apiKey) return null;
    return {
      provider: "zai",
      model: option.model,
      apiKey,
      baseUrl: ZAI_BASE_URL,
    };
  }
  if (option.provider === "gemini") {
    // Same namespacing pattern.
    const apiKey =
      process.env.loganGEMINI_API_KEY || process.env.GEMINI_API_KEY;
    if (!apiKey) return null;
    return {
      provider: "gemini",
      model: option.model,
      apiKey,
      baseUrl: GEMINI_BASE_URL,
    };
  }
  return null;
}

/**
 * Returns the full preference chain for a task, skipping providers without
 * API key. Used by the client to attempt each option in order.
 */
export function getTaskOptions(task: LLMTask): LLMConfig[] {
  const options = TASK_PREFERENCE_MAP[task] || [];
  const resolved: LLMConfig[] = [];
  for (const opt of options) {
    const cfg = resolveConfig(opt);
    if (cfg) resolved.push(cfg);
  }
  return resolved;
}

// ─── Legacy compat (deprecated — kept for any external caller) ───────────────

export function getLLMConfig(task: LLMTask): LLMConfig {
  const options = getTaskOptions(task);
  if (options.length === 0) {
    throw new Error(
      "No LLM provider available. Set ZAI_API_KEY or GEMINI_API_KEY.",
    );
  }
  return options[0];
}

export function isProviderAvailable(provider: LLMProvider): boolean {
  if (provider === "zai")
    return !!(process.env.loganZAI_API_KEY || process.env.ZAI_API_KEY);
  if (provider === "gemini")
    return !!(process.env.loganGEMINI_API_KEY || process.env.GEMINI_API_KEY);
  return false;
}

export function getLLMConfigWithFallback(task: LLMTask): LLMConfig {
  return getLLMConfig(task);
}

export function listProviders(): LLMProvider[] {
  const providers: LLMProvider[] = [];
  if (isProviderAvailable("zai")) providers.push("zai");
  if (isProviderAvailable("gemini")) providers.push("gemini");
  return providers;
}

export function getTaskModelMap(): Record<LLMTask, ModelOption[]> {
  return TASK_PREFERENCE_MAP;
}
