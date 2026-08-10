// LOGAN LLM — configuration: env vars + task → model mapping.
//
// The single source of truth for "which model runs which task". Tuning this
// map is how the user controls cost vs quality per task — e.g. switch `dev`
// to a stronger model when working on hard features, or pin `assistant` to
// the cheapest available model for the public bot.
//
// Resolution rules:
//   1. `getLLMConfig(task)` — returns the configured (provider, model) for the
//      task, with API key + baseUrl read from env vars. Does NOT check whether
//      the key is actually present — that's `isProviderAvailable`'s job.
//   2. `getLLMConfigWithFallback(task)` — returns the configured config if its
//      provider has a key; otherwise falls back to whichever provider IS
//      available. Throws if neither has a key (caller surfaces a 503).
//
// Default policy (DEC-LOGAN-006): Gemini 2.5 Flash for every task. The user
// has a free Gemini key; Z.ai has credits pending. When they load Z.ai
// credits, they can flip specific tasks (e.g. `dev` → GLM-5.2) here.

import type { LLMConfig, LLMProvider, LLMTask } from "./types";

// ─── Provider endpoints ──────────────────────────────────────────────────────

const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
const ZAI_BASE_URL = "https://api.z.ai/api/paas/v4";

// ─── Task → (provider, model) map ────────────────────────────────────────────
//
// This is THE customization point. To change which model runs which task,
// edit this map. Defaults: Gemini 2.5 Flash everywhere (cheap + fast + good
// enough for LOGAN's tasks on the free tier).
//
// When the user loads Z.ai credits, suggested swaps for higher quality:
//   - core_decide    → { provider: "zai", model: "glm-4.6" }  (better reasoning)
//   - core_integrate → { provider: "zai", model: "glm-4.6" }
//   - dev            → { provider: "zai", model: "glm-4.6" }  (better code)
//   - validator      → { provider: "zai", model: "glm-4.6" }  (precise JSON)
const TASK_MODEL_MAP: Record<LLMTask, { provider: LLMProvider; model: string }> = {
  core_decide:     { provider: "gemini", model: "gemini-2.0-flash" },
  core_integrate:  { provider: "gemini", model: "gemini-2.0-flash" },
  validator:       { provider: "gemini", model: "gemini-2.0-flash" },
  marketing:       { provider: "gemini", model: "gemini-2.0-flash" },
  dev:             { provider: "gemini", model: "gemini-2.0-flash" },
  design:          { provider: "gemini", model: "gemini-2.0-flash" },
  analytics:       { provider: "gemini", model: "gemini-2.0-flash" },
  finance:         { provider: "gemini", model: "gemini-2.0-flash" },
  legal:           { provider: "gemini", model: "gemini-2.0-flash" },
  support:         { provider: "gemini", model: "gemini-2.0-flash" },
  assistant:       { provider: "gemini", model: "gemini-2.0-flash" },
  showcase:        { provider: "gemini", model: "gemini-2.0-flash" },
};

/**
 * Returns the configured (provider, model) config for `task`, reading the API
 * key from env vars. Does NOT verify the key is present — for that, use
 * `getLLMConfigWithFallback`.
 */
export function getLLMConfig(task: LLMTask): LLMConfig {
  const mapping = TASK_MODEL_MAP[task];
  if (!mapping) throw new Error(`Unknown LLM task: ${task}`);

  if (mapping.provider === "gemini") {
    return {
      provider: "gemini",
      model: mapping.model,
      apiKey: process.env.GEMINI_API_KEY || "",
      baseUrl: GEMINI_BASE_URL,
    };
  }

  if (mapping.provider === "zai") {
    return {
      provider: "zai",
      model: mapping.model, // e.g. "glm-4.6"
      apiKey: process.env.ZAI_API_KEY || "",
      baseUrl: ZAI_BASE_URL,
    };
  }

  // Exhaustiveness check — TypeScript will error if a new LLMProvider is
  // added without a branch above.
  const _exhaustive: never = mapping.provider;
  throw new Error(`Unknown provider: ${_exhaustive as string}`);
}

/**
 * True if the provider has an API key configured in env vars. Used by the
 * fallback logic and the /api/health check.
 */
export function isProviderAvailable(provider: LLMProvider): boolean {
  if (provider === "gemini") return !!process.env.GEMINI_API_KEY;
  if (provider === "zai") return !!process.env.ZAI_API_KEY;
  return false;
}

/**
 * Returns the configured config for `task` if its provider has a key,
 * otherwise falls back to whichever provider IS available.
 *
 * Fallback priority when the primary provider isn't available:
 *   1. Gemini (free tier, usually available)
 *   2. Z.ai (paid, may not have credits)
 *
 * Throws if NEITHER provider has a key — the caller should surface a 503.
 */
export function getLLMConfigWithFallback(task: LLMTask): LLMConfig {
  const primary = getLLMConfig(task);
  if (primary.apiKey) return primary;

  // Primary not available — try Gemini first (it's the cheap/free default).
  if (isProviderAvailable("gemini")) {
    return {
      provider: "gemini",
      model: "gemini-2.0-flash",
      apiKey: process.env.GEMINI_API_KEY || "",
      baseUrl: GEMINI_BASE_URL,
    };
  }

  // Then Z.ai.
  if (isProviderAvailable("zai")) {
    return {
      provider: "zai",
      model: "glm-4.6",
      apiKey: process.env.ZAI_API_KEY || "",
      baseUrl: ZAI_BASE_URL,
    };
  }

  throw new Error(
    "No LLM provider available. Set GEMINI_API_KEY or ZAI_API_KEY in your environment.",
  );
}

/**
 * Lists all providers with their availability status, for /api/health and the
 * OS section UI. Never exposes the key — only whether one is set.
 */
export function listProviders(): Array<{ provider: LLMProvider; available: boolean }> {
  return [
    { provider: "gemini", available: isProviderAvailable("gemini") },
    { provider: "zai", available: isProviderAvailable("zai") },
  ];
}

/**
 * Returns the task → (provider, model) map for inspection (e.g. /api/health or
 * an admin UI). Read-only snapshot.
 */
export function getTaskModelMap(): Record<LLMTask, { provider: LLMProvider; model: string }> {
  return { ...TASK_MODEL_MAP };
}
