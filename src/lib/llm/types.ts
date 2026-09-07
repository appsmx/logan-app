// LLM provider-agnostic types
// DEC-LOGAN-006: LOGAN is independent of the provider.
// DEC-LOGAN-017: Mix of GLM-5.2/5.1/5-turbo by task criticality, with chained fallback.
//                If the preferred model fails (404/429/401), try the next in the chain.

export type LLMProvider = "zai" | "gemini" | "openai" | "deepseek" | "groq" | "openrouter" | "mistral";

export type LLMTask =
  | "core_decide"
  | "core_integrate"
  | "validator"
  | "marketing"
  | "dev"
  | "design"
  | "analytics"
  | "finance"
  | "legal"
  | "support"
  | "assistant"
  | "showcase";

export interface LLMMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  // Cuando role === "assistant" y el modelo pidió ejecutar herramientas.
  tool_calls?: LLMToolCall[];
  // Cuando role === "tool": id de la llamada que este mensaje responde.
  tool_call_id?: string;
  // Cuando role === "tool": nombre de la herramienta ejecutada (algunos
  // proveedores lo requieren, ej. Gemini).
  name?: string;
}

/**
 * Definición de una herramienta (function calling) que el modelo puede invocar.
 * Formato alineado con la API de OpenAI ("type": "function"). El proxy traduce
 * este formato al de cada proveedor (Gemini usa functionDeclarations).
 * DEC-LOGAN: function calling centralizado; cada proyecto define SUS tools.
 */
export interface LLMTool {
  type: "function";
  function: {
    name: string;
    description: string;
    // JSON Schema de los parámetros (objeto con properties/required).
    parameters: Record<string, unknown>;
  };
}

/**
 * Una invocación de herramienta emitida por el modelo. `arguments` es un string
 * JSON (igual que OpenAI); el caller lo parsea. Normalizamos el formato de todos
 * los proveedores a esta forma.
 */
export interface LLMToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

export interface LLMRequest {
  task: LLMTask;
  systemPrompt: string;
  userMessage: string;
  history?: LLMMessage[];
  maxTokens?: number;
  temperature?: number;
  // Herramientas disponibles para el modelo (function calling). Opcional:
  // si se omite, el proxy se comporta exactamente como antes (solo texto).
  tools?: LLMTool[];
  // Control de invocación: "auto" (el modelo decide), "none", o forzar una.
  toolChoice?: "auto" | "none" | { type: "function"; function: { name: string } };
}

export interface LLMResponse {
  text: string;
  provider: LLMProvider;
  model: string;
  usage: { promptTokens: number; completionTokens: number; totalTokens: number };
  // Presente solo cuando el modelo decidió invocar herramientas. Cuando esto
  // viene poblado, `text` puede estar vacío (el modelo pausó para llamar tools).
  toolCalls?: LLMToolCall[];
}

export interface LLMConfig {
  provider: LLMProvider;
  model: string;
  apiKey: string;
  baseUrl: string;
}
