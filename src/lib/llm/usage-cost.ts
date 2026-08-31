// Estimación de costo por uso de LLM (para control interno de gasto por proyecto).
// Precios aproximados en USD por 1M de tokens (input/output). Los proveedores
// gratuitos (gemini free tier, groq, openrouter :free, mistral free) se estiman
// en $0. Estos números son para control/reporte, NO para facturación exacta.

type PriceRow = { inPerM: number; outPerM: number };

// Precios por modelo (o prefijo de modelo). Ajustar cuando cambien las tarifas.
const MODEL_PRICES: Record<string, PriceRow> = {
  // Gratuitos (tier free) → costo 0
  "gemini-2.5-flash": { inPerM: 0, outPerM: 0 },
  "gemini-flash-latest": { inPerM: 0, outPerM: 0 },
  "llama-3.3-70b-versatile": { inPerM: 0, outPerM: 0 }, // Groq free
  "mistral-small-latest": { inPerM: 0, outPerM: 0 }, // Mistral free tier
  ":free": { inPerM: 0, outPerM: 0 }, // OpenRouter modelos :free

  // De pago (aprox., verificar con el proveedor)
  "deepseek-chat": { inPerM: 0.28, outPerM: 0.42 },
  "deepseek-v4-flash": { inPerM: 0.14, outPerM: 0.28 },
  "glm-5-turbo": { inPerM: 0.1, outPerM: 0.3 },
  "glm-5.2": { inPerM: 0.6, outPerM: 2.2 },
  "gpt-4o-mini": { inPerM: 0.15, outPerM: 0.6 },
  "gpt-4o": { inPerM: 2.5, outPerM: 10 },
};

/**
 * Estima el costo en USD de una llamada según modelo y tokens.
 * Si el modelo no está en la tabla, asume 0 (probablemente gratis o desconocido).
 */
export function estimateCostUsd(
  model: string,
  promptTokens: number,
  completionTokens: number
): number {
  let price = MODEL_PRICES[model];

  // Coincidencia por sufijo :free (OpenRouter) o prefijo de familia
  if (!price) {
    if (model.includes(":free")) price = MODEL_PRICES[":free"];
    else {
      const key = Object.keys(MODEL_PRICES).find((k) => model.startsWith(k));
      if (key) price = MODEL_PRICES[key];
    }
  }

  if (!price) return 0;

  const cost =
    (promptTokens / 1_000_000) * price.inPerM +
    (completionTokens / 1_000_000) * price.outPerM;

  return Math.round(cost * 1_000_000) / 1_000_000; // 6 decimales
}
