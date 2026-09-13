// LOGAN OS — Reporte de gasto de IA por proyecto (para el panel de admin).
//
// A diferencia de /api/llm/usage (protegido por LOGAN_LLM_SECRET para consumo
// externo), este endpoint está pensado para el PANEL de admin: queda protegido
// por el middleware (auth logan_auth), así que no expone el secret al navegador.
//
// Query (opcionales): ?from=ISO&to=ISO  (default: mes actual)
// Devuelve: { from, to, totals, byProject, byProvider }

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const now = new Date();
    const defaultFrom = new Date(now.getFullYear(), now.getMonth(), 1); // inicio de mes
    const from = searchParams.get("from") ? new Date(searchParams.get("from")!) : defaultFrom;
    const to = searchParams.get("to") ? new Date(searchParams.get("to")!) : now;

    const rows = await db.llmUsage.findMany({
      where: { createdAt: { gte: from, lte: to } },
      select: { project: true, tenant: true, provider: true, totalTokens: true, costUsd: true },
    });

    const byProjectMap = new Map<string, { calls: number; totalTokens: number; costUsd: number }>();
    const byProviderMap = new Map<string, { calls: number; totalTokens: number; costUsd: number }>();
    const byTenantMap = new Map<string, { calls: number; totalTokens: number; costUsd: number }>();
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

      // Desglose por cliente/negocio. Las llamadas sin tenant (registros
      // anteriores o servicios que no lo envían) se agrupan como "Sin identificar".
      const tenantKey = r.tenant && r.tenant.trim() ? r.tenant.trim() : "Sin identificar";
      const t = byTenantMap.get(tenantKey) || { calls: 0, totalTokens: 0, costUsd: 0 };
      t.calls += 1;
      t.totalTokens += r.totalTokens;
      t.costUsd += r.costUsd;
      byTenantMap.set(tenantKey, t);
    }

    const round = (n: number) => Math.round(n * 1_000_000) / 1_000_000;

    return NextResponse.json({
      from: from.toISOString(),
      to: to.toISOString(),
      totals: { calls: totalCalls, totalTokens, costUsd: round(totalCost) },
      byProject: [...byProjectMap.entries()]
        .map(([project, s]) => ({ project, ...s, costUsd: round(s.costUsd) }))
        .sort((a, b) => b.costUsd - a.costUsd),
      byTenant: [...byTenantMap.entries()]
        .map(([tenant, s]) => ({ tenant, ...s, costUsd: round(s.costUsd) }))
        .sort((a, b) => b.costUsd - a.costUsd),
      byProvider: [...byProviderMap.entries()]
        .map(([provider, s]) => ({ provider, ...s, costUsd: round(s.costUsd) }))
        .sort((a, b) => b.costUsd - a.costUsd),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[/api/usage-report] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
