// LLM usage tracking (Task 35).
//
// Logs every callLLM() invocation so the reseller can bill clients per
// project. Non-fatal: if the insert fails, the response still works (the
// LLM call already succeeded — tracking is purely an audit/billing concern).
//
// Usage pattern (after every callLLM):
//   const response = await callLLM({ task, systemPrompt, userMessage });
//   await trackLlmUsage({
//     projectId,
//     task,
//     provider: response.provider,
//     model: response.model,
//     promptTokens: response.usage.promptTokens,
//     completionTokens: response.usage.completionTokens,
//     totalTokens: response.usage.totalTokens,
//   });

import { db } from "@/lib/db";

export interface TrackLlmUsageParams {
  projectId?: string | null;
  task: string;
  provider: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

/**
 * Inserts a row into `LlmUsage` for billing/analytics. NEVER throws — on any
 * failure, logs the error and returns. Tracking is additive (Art. III).
 */
export async function trackLlmUsage(
  params: TrackLlmUsageParams,
): Promise<void> {
  try {
    await db.llmUsage.create({
      data: {
        projectId: params.projectId || null,
        task: params.task,
        provider: params.provider,
        model: params.model,
        promptTokens: params.promptTokens || 0,
        completionTokens: params.completionTokens || 0,
        totalTokens: params.totalTokens || 0,
      },
    });
  } catch (e) {
    // Non-fatal — don't break the response if tracking fails.
    console.error("[llm] trackLlmUsage failed:", (e as Error).message);
  }
}
