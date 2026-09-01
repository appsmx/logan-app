import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

/**
 * GET /api/llm/usage — reporte de consumo de IA agrupado por proyecto.
 *
 * Query params (opcionales):
 *   - from: ISO date (ej. 2026-08-01) — desde cuándo contar (default: inicio de mes)
 *   - to:   ISO date — hasta cuándo (default: ahora)
 *   - project: filtrar un solo proyecto
 *
 * Auth: mismo LOGAN_LLM_SECRET que el proxy (si está configurado).
 *
 * Respuesta:
 * {
 *   from, to,
 *   totals: { calls, totalTokens, costUsd },
 *   byProject: [ { project, calls, totalTokens, costUsd } ],
 *   byProvider: [ { provider, calls, totalTokens, costUsd } ]
 * }
 */
export async function GET(req: NextRequest) {
  try {
    // Auth (mismo secreto que el proxy)
    const secret = process.env.LOGAN_LLM_SECRET;
    if (secret) {
      const authHeader = req.headers.get("authorization");
      if (!authHeader || authHeader !== `Bearer ${secret}`) {
        return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
      }
    }

    const { searchParams } = new URL(req.url);
    const now = new Date();
    const defaultFrom = new Date(now.getFullYear(), now.getMonth(), 1); // inicio de mes

    const from = searchParams.get("from") ? new Date(searchParams.get("from")!) : defaultFrom;
    const to = searchParams.get("to") ? new Date(searchParams.get("to")!) : now;
    const projectFilter = searchParams.get("project");

    const rows = await db.llmUsage.findMany({
      where: {
        createdAt: { gte: from, lte: to },
        ...(projectFilter ? { project: projectFilter } : {}),
      },
      select: {
        project: true,
        provider: true,
        totalTokens: true,
        costUsd: true,
      },
    });

    // Agregaciones
    const byProjectMap = new Map<string, { calls: number; totalTokens: number; costUsd: number }>();
    const byProviderMap = new Map<string, { calls: number; totalTokens: number; costUsd: number }>();
    let totalCalls = 0;
    let totalTokens = 0;
    let totalCost = 0;

    for (const r of rows) {
      totalCalls += 1;
      totalTokens += r.totalTokens;
      totalCost += r.costUsd;

      const p = byProjectMap.get(r.project) || { calls: 0, totalTokens: 0, costUsd: 0 };
      p.calls += 1;
      p.totalTokens += r.totalTokens;
      p.costUsd += r.costUsd;
      byProjectMap.set(r.project, p);

      const v = byProviderMap.get(r.provider) || { calls: 0, totalTokens: 0, costUsd: 0 };
      v.calls += 1;
      v.totalTokens += r.totalTokens;
      v.costUsd += r.costUsd;
      byProviderMap.set(r.provider, v);
    }

    const round = (n: number) => Math.round(n * 1_000_000) / 1_000_000;

    return NextResponse.json({
      from: from.toISOString(),
      to: to.toISOString(),
      totals: { calls: totalCalls, totalTokens, costUsd: round(totalCost) },
      byProject: [...byProjectMap.entries()]
        .map(([project, s]) => ({ project, ...s, costUsd: round(s.costUsd) }))
        .sort((a, b) => b.costUsd - a.costUsd),
      byProvider: [...byProviderMap.entries()]
        .map(([provider, s]) => ({ provider, ...s, costUsd: round(s.costUsd) }))
        .sort((a, b) => b.costUsd - a.costUsd),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[/api/llm/usage] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
