// LOGAN OS — Reporte de gasto de IA por proyecto (para el panel de admin).
//
// A diferencia de /api/llm/usage (protegido por LOGAN_LLM_SECRET para consumo
// externo), este endpoint está pensado para el PANEL de admin: queda protegido
// por el middleware (auth logan_auth), así que no expone el secret al navegador.
//
// Query (opcionales): ?from=ISO&to=ISO  (default: mes actual)
// Devuelve: { from, to, totals, byProject, byTenant, byClient, byChannel,
//            byClientChannel, byProvider }

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
      select: {
        project: true,
        tenant: true,
        client: true,
        channel: true,
        provider: true,
        totalTokens: true,
        costUsd: true,
      },
    });

    type Bucket = { calls: number; totalTokens: number; costUsd: number };
    const mkMap = () => new Map<string, Bucket>();
    const byProjectMap = mkMap();
    const byProviderMap = mkMap();
    const byTenantMap = mkMap();
    const byClientMap = mkMap();
    const byChannelMap = mkMap();
    // Desglose por canal DENTRO de cada cliente: clientSlug -> (channel -> Bucket)
    const clientChannelMap = new Map<string, Map<string, Bucket>>();
    let totalCalls = 0;
    let totalTokens = 0;
    let totalCost = 0;

    const bump = (map: Map<string, Bucket>, key: string, r: { totalTokens: number; costUsd: number }) => {
      const b = map.get(key) || { calls: 0, totalTokens: 0, costUsd: 0 };
      b.calls += 1;
      b.totalTokens += r.totalTokens;
      b.costUsd += r.costUsd;
      map.set(key, b);
    };

    for (const r of rows) {
      totalCalls += 1;
      totalTokens += r.totalTokens;
      totalCost += r.costUsd;

      bump(byProjectMap, r.project, r);
      bump(byProviderMap, r.provider, r);
      bump(byTenantMap, r.tenant && r.tenant.trim() ? r.tenant.trim() : "Sin identificar", r);

      const clientKey = r.client && r.client.trim() ? r.client.trim() : "Sin identificar";
      const channelKey = r.channel && r.channel.trim() ? r.channel.trim() : "Sin identificar";
      bump(byClientMap, clientKey, r);
      bump(byChannelMap, channelKey, r);

      // Canal dentro del cliente (para mostrarle a cada cliente en qué gasta más).
      let inner = clientChannelMap.get(clientKey);
      if (!inner) {
        inner = mkMap();
        clientChannelMap.set(clientKey, inner);
      }
      bump(inner, channelKey, r);
    }

    const round = (n: number) => Math.round(n * 1_000_000) / 1_000_000;
    const serialize = <K extends string>(map: Map<string, Bucket>, keyName: K) =>
      [...map.entries()]
        .map(([k, s]) => ({ [keyName]: k, ...s, costUsd: round(s.costUsd) }))
        .sort((a, b) => b.costUsd - a.costUsd);

    return NextResponse.json({
      from: from.toISOString(),
      to: to.toISOString(),
      totals: { calls: totalCalls, totalTokens, costUsd: round(totalCost) },
      byProject: serialize(byProjectMap, "project"),
      byTenant: serialize(byTenantMap, "tenant"),
      byClient: serialize(byClientMap, "client"),
      byChannel: serialize(byChannelMap, "channel"),
      // Por cada cliente, su desglose de canales (en qué apartado gasta más).
      byClientChannel: [...clientChannelMap.entries()].map(([client, inner]) => ({
        client,
        channels: serialize(inner, "channel"),
      })),
      byProvider: serialize(byProviderMap, "provider"),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[/api/usage-report] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
