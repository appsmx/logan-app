// LLM provider-agnostic types
// DEC-LOGAN-006: LOGAN is independent of the provider.
// DEC-LOGAN-017: Mix of GLM-5.2/5.1/5-turbo by task criticality, with chained fallback.
//                If the preferred model fails (404/429/401), try the next in the chain.

export type LLMProvider = "zai" | "gemini";

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
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LLMRequest {
  task: LLMTask;
  systemPrompt: string;
  userMessage: string;
  history?: LLMMessage[];
  maxTokens?: number;
  temperature?: number;
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
