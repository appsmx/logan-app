// LLM provider-agnostic types
// DEC-LOGAN-006: LOGAN is independent of the provider.

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
