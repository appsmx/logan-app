"use client";

// LOGAN OS — Gasto de IA por proyecto.
// Consume /api/usage-report (protegido por auth de admin) y muestra cuánto
// ha gastado cada proyecto/cliente en APIs de IA (útil para el pricing).

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SectionHeading } from "@/components/logan/SectionHeading";
import { EmptyState } from "@/components/logan/EmptyState";
import { Coins, Cpu, TrendingUp } from "lucide-react";

type Bucket = { calls: number; totalTokens: number; costUsd: number };
type UsageReport = {
  from: string;
  to: string;
  totals: Bucket;
  byProject: (Bucket & { project: string })[];
  byProvider: (Bucket & { provider: string })[];
};

function money(n: number) {
  return `$${n.toFixed(n < 0.01 ? 6 : 4)} USD`;
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("es-MX", { day: "numeric", month: "short" });
}

export function UsageSection() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["usage-report"],
    queryFn: () => api<UsageReport>("/api/usage-report"),
    refetchInterval: 30000,
  });

  return (
    <section className="space-y-6" aria-labelledby="usage-title">
      <SectionHeading
        eyebrow="Costos · IA"
        title="Gasto por proyecto"
        icon="Coins"
        description="Cuánto ha consumido cada proyecto en APIs de IA este mes. Útil para calcular el precio de tu servicio por cliente."
      />

      {isLoading && (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Cargando reporte…
          </CardContent>
        </Card>
      )}

      {error && (
        <Card>
          <CardContent className="py-10 text-center text-sm text-destructive">
            No se pudo cargar el reporte de gasto.
          </CardContent>
        </Card>
      )}

      {data && (
        <>
          {/* Totales del periodo */}
          <div className="grid gap-4 sm:grid-cols-3">
            <TotalCard
              icon={<Coins className="size-5" />}
              label="Gasto total"
              value={money(data.totals.costUsd)}
              sub={`${fmtDate(data.from)} – ${fmtDate(data.to)}`}
            />
            <TotalCard
              icon={<TrendingUp className="size-5" />}
              label="Llamadas"
              value={data.totals.calls.toLocaleString("es-MX")}
              sub="peticiones a IA"
            />
            <TotalCard
              icon={<Cpu className="size-5" />}
              label="Tokens"
              value={data.totals.totalTokens.toLocaleString("es-MX")}
              sub="procesados"
            />
          </div>

          {/* Gasto por proyecto */}
          <Card className="border-t-2 border-t-warning/40">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 font-serif text-lg">
                <Coins className="size-5 text-warning" />
                Por proyecto
              </CardTitle>
              <CardDescription>
                Ordenado de mayor a menor gasto. Compara cuánto te cuesta cada cliente.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {data.byProject.length === 0 ? (
                <EmptyState
                  icon={<Coins className="size-5" />}
                  title="Sin consumo este mes"
                  description="Cuando los proyectos usen IA, su gasto aparecerá aquí."
                />
              ) : (
                <BreakdownBars
                  rows={data.byProject.map((p) => ({
                    label: p.project,
                    calls: p.calls,
                    cost: p.costUsd,
                  }))}
                  max={Math.max(...data.byProject.map((p) => p.costUsd), 0.000001)}
                />
              )}
            </CardContent>
          </Card>

          {/* Gasto por proveedor */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 font-serif text-lg">
                <Cpu className="size-5 text-muted-foreground" />
                Por proveedor de IA
              </CardTitle>
              <CardDescription>Qué proveedores (Z.ai, Gemini, etc.) se están usando.</CardDescription>
            </CardHeader>
            <CardContent>
              {data.byProvider.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">Sin datos.</p>
              ) : (
                <BreakdownBars
                  rows={data.byProvider.map((p) => ({
                    label: p.provider,
                    calls: p.calls,
                    cost: p.costUsd,
                  }))}
                  max={Math.max(...data.byProvider.map((p) => p.costUsd), 0.000001)}
                />
              )}
            </CardContent>
          </Card>
        </>
      )}
    </section>
  );
}

function TotalCard({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 py-5">
        <span className="flex size-11 items-center justify-center rounded-lg bg-warning/10 text-warning ring-1 ring-warning/25">
          {icon}
        </span>
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className="font-serif text-xl text-foreground">{value}</p>
          <p className="text-xs text-muted-foreground">{sub}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function BreakdownBars({
  rows,
  max,
}: {
  rows: { label: string; calls: number; cost: number }[];
  max: number;
}) {
  return (
    <div className="space-y-3">
      {rows.map((r) => (
        <div key={r.label}>
          <div className="mb-1 flex items-center justify-between text-sm">
            <span className="font-medium text-foreground/90">{r.label}</span>
            <span className="text-muted-foreground">
              {money(r.cost)} · {r.calls} llamadas
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[oklch(0.78_0.16_65)] to-[oklch(0.62_0.13_35)]"
              style={{ width: `${Math.max(2, (r.cost / max) * 100)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
