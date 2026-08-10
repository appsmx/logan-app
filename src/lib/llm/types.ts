// LOGAN LLM — provider-agnostic types.
//
// DEC-LOGAN-006 (provider independence): LOGAN OS must NOT be coupled to a
// single LLM vendor. This module abstracts the LLM call so the rest of the
// codebase talks to "the LLM" via `callLLM(request)`, not to a specific SDK.
//
// Today we support two providers:
//   - gemini  → Google AI Studio (generativelanguage.googleapis.com). Free tier.
//   - zai     → Z.ai OpenAI-compatible endpoint (api.z.ai/api/paas/v4). Paid.
//
// Each task in LOGAN maps to a specific (provider, model) pair via
// `TASK_MODEL_MAP` in `config.ts`. This is the "different models for different
// tasks" feature: a cheap fast model for chat, a smarter model for code, etc.
//
// Adding a new provider later (e.g. anthropic, openai) means:
//   1. Add the literal to `LLMProvider`.
//   2. Add a branch in `getLLMConfig` / `getLLMConfigWithFallback`.
//   3. Add a `callXxx` function in `client.ts`.
// Nothing else in the codebase changes.

export type LLMProvider = "zai" | "gemini";

/**
 * The discrete LLM tasks LOGAN performs. Each maps 1:1 to a (provider, model)
 * pair in `TASK_MODEL_MAP`. Add new tasks here when a new caller needs its own
 * tuning — don't reuse an unrelated task.
 *
 * Naming: `<role>_<action>` so it's obvious from the call site what's running.
 */
export type LLMTask =
  | "core_decide"      // Core decides what to do (needs good reasoning)
  | "core_integrate"   // Core integrates specialist's work (needs good reasoning)
  | "validator"        // Constitutional validator (precise instruction following)
  | "marketing"        // Marketing specialist (creativity + Spanish)
  | "dev"              // Dev specialist (code generation)
  | "design"           // Design specialist (structured output)
  | "analytics"        // Analytics (data reasoning)
  | "finance"          // Finance (numbers reasoning)
  | "legal"            // Legal (precise language)
  | "support"          // Support (empathy + clarity)
  | "assistant"        // Customer-facing bot (speed + Spanish, multi-turn)
  | "showcase";        // Public showcase chat (rate-limited, cheap)

export interface LLMMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LLMRequest {
  task: LLMTask;
  systemPrompt: string;
  userMessage: string;
  maxTokens?: number;
  temperature?: number;
  /**
   * Optional prior conversation turns (multi-turn endpoints like
   * /api/assistant/chat). These are inserted between the system prompt and the
   * new `userMessage`. Omit for single-turn callers (the vast majority).
   */
  history?: LLMMessage[];
}

export interface LLMResponse {
  text: string;
  provider: LLMProvider;
  model: string;
  usage: { promptTokens: number; completionTokens: number; totalTokens: number };
}

export interface LLMConfig {
  provider: LLMProvider;
  model: string;
  apiKey: string;
  baseUrl: string;
}
