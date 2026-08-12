// LLM usage stats endpoint (Task 35).
//
// GET /api/usage            — global summary across all projects (last 30 days).
// GET /api/usage?projectId=X — usage for a single project (all time + last 30 days).
//
// Returns:
//   - total: { promptTokens, completionTokens, totalTokens, calls }
//   - byProject: [{ projectId, projectName, totalTokens }] (skipped when projectId filter is set)
//   - byModel:  [{ model, totalTokens, calls }]
//   - byTask:   [{ task, totalTokens, calls }]
//   - last30Days: [{ date: "YYYY-MM-DD", totalTokens }]
//
// Used by the "Uso LLM" sidebar section for the reseller to bill clients per
// project. Art. III — simple aggregation, no fancy analytics.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

const DAY_MS = 24 * 60 * 60 * 1000;

function isoDay(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export async function GET(req: NextRequest) {
  try {
    console.log("[usage] db.llmUsage type:", typeof (db as unknown as { llmUsage?: { findMany?: unknown } }).llmUsage, "db.project type:", typeof (db as unknown as { project?: { findUnique?: unknown } }).project);

    const projectId = req.nextUrl.searchParams.get("projectId") || null;
    const since = new Date(Date.now() - 30 * DAY_MS);

    const where = projectId ? { projectId, createdAt: { gte: since } } : { createdAt: { gte: since } };

    const rows = await db.llmUsage.findMany({
      where,
      select: {
        projectId: true,
        task: true,
        provider: true,
        model: true,
        promptTokens: true,
        completionTokens: true,
        totalTokens: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });

    // Aggregate totals.
    let promptTokens = 0;
    let completionTokens = 0;
    let totalTokens = 0;

    const byProjectMap = new Map<string, number>();
    const byModelMap = new Map<string, { totalTokens: number; calls: number }>();
    const byTaskMap = new Map<string, { totalTokens: number; calls: number }>();
    const byDayMap = new Map<string, number>();

    for (const r of rows) {
      promptTokens += r.promptTokens;
      completionTokens += r.completionTokens;
      totalTokens += r.totalTokens;

      const projectKey = r.projectId ?? "(sin proyecto)";
      byProjectMap.set(projectKey, (byProjectMap.get(projectKey) || 0) + r.totalTokens);

      const modelAgg = byModelMap.get(r.model) || { totalTokens: 0, calls: 0 };
      modelAgg.totalTokens += r.totalTokens;
      modelAgg.calls += 1;
      byModelMap.set(r.model, modelAgg);

      const taskAgg = byTaskMap.get(r.task) || { totalTokens: 0, calls: 0 };
      taskAgg.totalTokens += r.totalTokens;
      taskAgg.calls += 1;
      byTaskMap.set(r.task, taskAgg);

      const day = isoDay(r.createdAt);
      byDayMap.set(day, (byDayMap.get(day) || 0) + r.totalTokens);
    }

    // Resolve project names (only for projects that appear in the aggregation).
    const projectIds = [...byProjectMap.keys()].filter((k) => k !== "(sin proyecto)");
    const projects = projectIds.length
      ? await db.project.findMany({
          where: { id: { in: projectIds } },
          select: { id: true, name: true },
        })
      : [];
    const nameById = new Map(projects.map((p) => [p.id, p.name]));

    const byProject = projectId
      ? [] // skipped when filter is set — the caller already knows the project
      : [...byProjectMap.entries()]
          .map(([pid, tokens]) => ({
            projectId: pid === "(sin proyecto)" ? null : pid,
            projectName:
              pid === "(sin proyecto)"
                ? "(sin proyecto)"
                : (nameById.get(pid) ?? "(proyecto eliminado)"),
            totalTokens: tokens,
          }))
          .sort((a, b) => b.totalTokens - a.totalTokens);

    const byModel = [...byModelMap.entries()]
      .map(([model, agg]) => ({ model, totalTokens: agg.totalTokens, calls: agg.calls }))
      .sort((a, b) => b.totalTokens - a.totalTokens);

    const byTask = [...byTaskMap.entries()]
      .map(([task, agg]) => ({ task, totalTokens: agg.totalTokens, calls: agg.calls }))
      .sort((a, b) => b.totalTokens - a.totalTokens);

    // Fill missing days in the 30-day window so the chart shows zeroes.
    const last30Days: { date: string; totalTokens: number }[] = [];
    for (let i = 29; i >= 0; i--) {
      const day = isoDay(new Date(Date.now() - i * DAY_MS));
      last30Days.push({ date: day, totalTokens: byDayMap.get(day) || 0 });
    }

    return NextResponse.json({
      filter: projectId ? { projectId } : null,
      windowDays: 30,
      total: { promptTokens, completionTokens, totalTokens, calls: rows.length },
      byProject,
      byModel,
      byTask,
      last30Days,
    });
  } catch (e) {
    console.error("[usage] GET failed:", (e as Error).message);
    return NextResponse.json(
      { error: "No se pudo generar el reporte de uso" },
      { status: 500 },
    );
  }
}
