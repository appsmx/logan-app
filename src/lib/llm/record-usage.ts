// LOGAN OS — helper para registrar el gasto de IA en LlmUsage.
//
// Centraliza el registro para que CUALQUIER endpoint que use callLLM pueda
// registrar el consumo por proyecto (no solo el proxy /api/llm). Antes, solo
// /api/llm registraba; endpoints como /api/assistant/chat usaban callLLM sin
// registrar → el gasto de esos proyectos (ej. Mr. Trámite) no aparecía en el
// reporte. Este helper corrige esa brecha.
//
// Es "best effort": no bloquea ni lanza — si el registro falla, solo loguea.

import { db } from "@/lib/db";
import { estimateCostUsd } from "@/lib/llm/usage-cost";
import type { LLMResponse, LLMTask } from "@/lib/llm/types";

export function recordLlmUsage(
  project: string,
  task: LLMTask,
  result: LLMResponse,
): void {
  const costUsd = estimateCostUsd(
    result.model,
    result.usage?.promptTokens || 0,
    result.usage?.completionTokens || 0,
  );
  db.llmUsage
    .create({
      data: {
        project: project?.trim() ? project.trim() : "desconocido",
        task,
        provider: result.provider,
        model: result.model,
        promptTokens: result.usage?.promptTokens || 0,
        completionTokens: result.usage?.completionTokens || 0,
        totalTokens: result.usage?.totalTokens || 0,
        costUsd,
      },
    })
    .catch((e) => console.error("[recordLlmUsage] No se pudo registrar el uso:", e?.message));
}
