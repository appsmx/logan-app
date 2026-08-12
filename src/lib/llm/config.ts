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
// Ordered by COST-EFFICIENCY (free first, paid only when needed).
//
// STRATEGY (DEC-LOGAN-017 rev. 2026-08-12):
// The previous version always tried GLM-5.x first and fell back to Gemini.
// That burned Z.ai credits even for trivial tasks (chat, validator, etc.).
// Now we INVERT the order for non-critical tasks: Gemini free tier first,
// GLM only if Gemini is unavailable or rate-limited.
//
// GLM-5.2 is reserved for the 3 tasks where quality truly matters
// (Core decide/integrate + Dev). Everything else uses Gemini Flash first.
//
// Cost comparison per 1M tokens (approx):
//   gemini-2.0-flash: $0 (free tier, 1500 req/day)
//   glm-5-turbo:      $0.10 / $0.30  (input/output)
//   glm-4-flash:      $0.05 / $0.15
//   glm-4.6:          $0.50 / $1.50
//   glm-5.1:          $2.00 / $6.00
//   glm-5.2:          $5.00 / $15.00
//
// Estimated savings:
//   Showcase/Assistant chat: 100% free (Gemini free tier handles them)
//   Validator: 100% free (runs on every Core turn, was burning GLM credits)
//   Marketing/Finance/Legal/Support: 95%+ free (occasional Gemini rate limit)
//   Core (decide+integrate): unchanged (still GLM-5.2 for quality)
//   Net result: ~80-90% reduction in Z.ai spend for typical usage.

type ModelOption = { provider: LLMProvider; model: string };

const TASK_PREFERENCE_MAP: Record<LLMTask, ModelOption[]> = {
  // ─── GLM-5.2 tier (máxima calidad — los 3 únicos que realmente la necesitan) ─
  // Cost: ~$0.025-0.05 per Core turn (worth it — wrong delegation = expensive bug).
  // Falls back to glm-4.6 (10x cheaper, similar quality) if GLM-5.2 unavailable.
  // Falls back to gemini-2.0-flash only if Z.ai is completely down.
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

  // ─── Gemini-first tier (todo lo demás) ───────────────────────────────────
  // Gemini 2.0 Flash free tier is genuinely good for routine work — design
  // specs, analytics pattern detection, legal docs, marketing copy, support
  // FAQs, chatbot answers. The quality gap vs GLM-5.x is small for these tasks,
  // and $0 > $0.001-0.005 per turn.
  //
  // Falls back to glm-5-turbo (cheap) → glm-4.6 (workhorse) → fail.
  // Note: we put glm-5-turbo BEFORE glm-4.6 here because for these tasks
  // speed matters more than precision (customer-facing, etc.).
  design: [
    { provider: "gemini", model: "gemini-2.0-flash" },
    { provider: "zai", model: "glm-5-turbo" },
    { provider: "zai", model: "glm-4.6" },
  ],
  analytics: [
    { provider: "gemini", model: "gemini-2.0-flash" },
    { provider: "zai", model: "glm-5-turbo" },
    { provider: "zai", model: "glm-4.6" },
  ],
  legal: [
    { provider: "gemini", model: "gemini-2.0-flash" },
    { provider: "zai", model: "glm-5-turbo" },
    { provider: "zai", model: "glm-4.6" },
  ],
  validator: [
    { provider: "gemini", model: "gemini-2.0-flash" },
    { provider: "zai", model: "glm-5-turbo" },
    { provider: "zai", model: "glm-4.6" },
  ],
  marketing: [
    { provider: "gemini", model: "gemini-2.0-flash" },
    { provider: "zai", model: "glm-5-turbo" },
    { provider: "zai", model: "glm-4.6" },
  ],
  finance: [
    { provider: "gemini", model: "gemini-2.0-flash" },
    { provider: "zai", model: "glm-5-turbo" },
    { provider: "zai", model: "glm-4.6" },
  ],
  support: [
    { provider: "gemini", model: "gemini-2.0-flash" },
    { provider: "zai", model: "glm-5-turbo" },
    { provider: "zai", model: "glm-4.6" },
  ],
  assistant: [
    { provider: "gemini", model: "gemini-2.0-flash" },
    { provider: "zai", model: "glm-5-turbo" },
    { provider: "zai", model: "glm-4.6" },
  ],
  showcase: [
    { provider: "gemini", model: "gemini-2.0-flash" },
    { provider: "zai", model: "glm-5-turbo" },
    { provider: "zai", model: "glm-4.6" },
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
