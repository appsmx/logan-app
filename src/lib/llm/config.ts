// LLM configuration: 4 providers with fallback chain.
// DeepSeek primario (más barato) → Z.ai → Gemini → OpenAI.
// DEC-LOGAN-006: independence del proveedor.

import type { LLMConfig, LLMTask, LLMProvider } from "./types";

// PRIORIDAD DE COSTO: gratis primero, de pago al final.
// Primario = Gemini (gratis). El fallback recorre: Groq → OpenRouter → Mistral
// (todos gratis) → Z.ai → DeepSeek → OpenAI (de pago, último recurso).
// Excepción: dev usa Z.ai GLM-5.2 como primario (mejor calidad de código).
const TASK_MODEL_MAP: Record<LLMTask, { provider: LLMProvider; model: string }> = {
  core_decide:     { provider: "gemini", model: "gemini-2.5-flash" },
  core_integrate:  { provider: "gemini", model: "gemini-2.5-flash" },
  dev:             { provider: "zai", model: "glm-5.2" },
  design:          { provider: "gemini", model: "gemini-2.5-flash" },
  analytics:       { provider: "gemini", model: "gemini-2.5-flash" },
  legal:           { provider: "gemini", model: "gemini-2.5-flash" },
  validator:       { provider: "gemini", model: "gemini-2.5-flash" },
  marketing:       { provider: "gemini", model: "gemini-2.5-flash" },
  finance:         { provider: "gemini", model: "gemini-2.5-flash" },
  support:         { provider: "gemini", model: "gemini-2.5-flash" },
  assistant:       { provider: "gemini", model: "gemini-2.5-flash" },
  showcase:        { provider: "gemini", model: "gemini-2.5-flash" },
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
  if (provider === "groq") return !!process.env.GROQ_API_KEY;
  if (provider === "openrouter") return !!process.env.OPENROUTER_API_KEY;
  if (provider === "mistral") return !!process.env.MISTRAL_API_KEY;
  return false;
}

// Cascada por COSTO (gratis primero → de pago al final):
//   Gemini → Groq → OpenRouter → Mistral → Z.ai → DeepSeek → OpenAI
// Cada proveedor se agrega solo si su API key está configurada.
// Modelo por defecto de cada uno en el fallback (barato/gratis):
const FALLBACK_ORDER: { provider: LLMProvider; model: string }[] = [
  { provider: "gemini", model: "gemini-2.5-flash" },                          // gratis
  { provider: "groq", model: "llama-3.3-70b-versatile" },                     // gratis
  { provider: "openrouter", model: "meta-llama/llama-3.3-70b-instruct:free" },// gratis
  { provider: "mistral", model: "mistral-small-latest" },                     // gratis
  { provider: "zai", model: "glm-5-turbo" },                                  // barato
  { provider: "deepseek", model: "deepseek-chat" },                           // de pago (barato)
  { provider: "openai", model: "gpt-4o-mini" },                               // de pago (último recurso)
];

export function getLLMConfigWithFallback(task: LLMTask): LLMConfig[] {
  const primary = getLLMConfig(task);
  const options: LLMConfig[] = [];

  // El primario del task va primero (si su key está disponible)
  if (isProviderAvailable(primary.provider)) {
    options.push(primary);
  }

  // Luego el resto de la cascada por costo, sin repetir el primario
  for (const { provider, model } of FALLBACK_ORDER) {
    if (provider === primary.provider) continue;
    if (isProviderAvailable(provider)) {
      options.push(buildConfig(provider, model));
    }
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
  if (provider === "groq") {
    return { provider, model, apiKey: process.env.GROQ_API_KEY || "", baseUrl: "https://api.groq.com/openai/v1" };
  }
  if (provider === "openrouter") {
    return { provider, model, apiKey: process.env.OPENROUTER_API_KEY || "", baseUrl: "https://openrouter.ai/api/v1" };
  }
  if (provider === "mistral") {
    return { provider, model, apiKey: process.env.MISTRAL_API_KEY || "", baseUrl: "https://api.mistral.ai/v1" };
  }
  throw new Error(`Unknown provider: ${provider}`);
}
