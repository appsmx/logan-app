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
import { Building2, ChevronDown, Coins, Cpu, Radio, TrendingUp } from "lucide-react";

type Bucket = { calls: number; totalTokens: number; costUsd: number };
type UsageReport = {
  from: string;
  to: string;
  totals: Bucket;
  byProject: (Bucket & { project: string })[];
  byTenant: (Bucket & { tenant: string })[];
  byClient: (Bucket & { client: string })[];
  byChannel: (Bucket & { channel: string })[];
  byClientChannel: { client: string; channels: (Bucket & { channel: string })[] }[];
  byProvider: (Bucket & { provider: string })[];
};

// Etiqueta legible para cada canal técnico.
const CHANNEL_LABELS: Record<string, string> = {
  pdv: "🖥️ Punto de venta (PDV)",
  web: "🌐 Sitio web",
  whatsapp: "📱 WhatsApp",
  instagram: "📸 Instagram",
  messenger: "💬 Messenger",
  "Sin identificar": "Sin identificar",
};
function channelLabel(c: string) {
  return CHANNEL_LABELS[c] ?? c;
}

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

          {/* Gasto por cliente/negocio (agrupado por slug) con desglose de canal */}
          <Card className="border-t-2 border-t-primary/40">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 font-serif text-lg">
                <Building2 className="size-5 text-primary" />
                Por cliente
              </CardTitle>
              <CardDescription>
                Gasto total de IA por cliente (suma todos sus canales: PDV, web, WhatsApp…). La base para cobrarle a cada uno. Toca un cliente para ver en qué canal gasta más.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {data.byClient.length === 0 ? (
                <EmptyState
                  icon={<Building2 className="size-5" />}
                  title="Sin consumo por cliente este mes"
                  description="Cuando los negocios usen IA, verás aquí cuánto gasta cada uno."
                />
              ) : (
                <div className="space-y-2">
                  {data.byClient.map((c) => (
                    <ClientRow
                      key={c.client}
                      client={c.client}
                      cost={c.costUsd}
                      calls={c.calls}
                      max={Math.max(...data.byClient.map((x) => x.costUsd), 0.000001)}
                      channels={
                        data.byClientChannel.find((cc) => cc.client === c.client)?.channels ?? []
                      }
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Gasto por canal (global, todos los clientes) */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 font-serif text-lg">
                <Radio className="size-5 text-muted-foreground" />
                Por canal
              </CardTitle>
              <CardDescription>Dónde se usa más la IA en todo el ecosistema (PDV, web, WhatsApp…).</CardDescription>
            </CardHeader>
            <CardContent>
              {data.byChannel.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">Sin datos.</p>
              ) : (
                <BreakdownBars
                  rows={data.byChannel.map((c) => ({
                    label: channelLabel(c.channel),
                    calls: c.calls,
                    cost: c.costUsd,
                  }))}
                  max={Math.max(...data.byChannel.map((c) => c.costUsd), 0.000001)}
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

/**
 * Fila de un cliente en el desglose "Por cliente". Muestra su gasto total y,
 * al expandirse, en qué canal (PDV, web, WhatsApp…) gastó más — útil para
 * mostrarle al propio cliente el detalle de su consumo.
 */
function ClientRow({
  client,
  cost,
  calls,
  max,
  channels,
}: {
  client: string;
  cost: number;
  calls: number;
  max: number;
  channels: { channel: string; calls: number; costUsd: number }[];
}) {
  const [open, setOpen] = React.useState(false);
  const hasDetail = channels.length > 0;

  return (
    <div className="rounded-lg border border-border/60 bg-card/40">
      <button
        type="button"
        onClick={() => hasDetail && setOpen((v) => !v)}
        className="w-full px-3 py-2.5 text-left"
        aria-expanded={open}
      >
        <div className="mb-1 flex items-center justify-between text-sm">
          <span className="flex items-center gap-1.5 font-medium text-foreground/90">
            {hasDetail && (
              <ChevronDown
                className={`size-4 text-muted-foreground transition-transform ${open ? "" : "-rotate-90"}`}
              />
            )}
            {client}
          </span>
          <span className="text-muted-foreground">
            {money(cost)} · {calls} llamadas
          </span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-gradient-to-r from-[oklch(0.62_0.13_260)] to-[oklch(0.55_0.15_300)]"
            style={{ width: `${Math.max(2, (cost / max) * 100)}%` }}
          />
        </div>
      </button>

      {open && hasDetail && (
        <div className="border-t border-border/60 px-3 py-3 pl-9">
          <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">
            Gasto por canal
          </p>
          <BreakdownBars
            rows={channels.map((ch) => ({
              label: channelLabel(ch.channel),
              calls: ch.calls,
              cost: ch.costUsd,
            }))}
            max={Math.max(...channels.map((ch) => ch.costUsd), 0.000001)}
          />
        </div>
      )}
    </div>
  );
}
