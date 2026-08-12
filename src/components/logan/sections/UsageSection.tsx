"use client";

import * as React from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SectionHeading } from "@/components/logan/SectionHeading";
import { EmptyState } from "@/components/logan/EmptyState";
import { useProjects, useLlmUsage } from "@/lib/hooks";
import { useLoganStore } from "@/lib/store";
import { BarChart3, RefreshCw } from "lucide-react";

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

const TASK_LABEL: Record<string, string> = {
  core_decide: "Core (decide)",
  core_integrate: "Core (integra)",
  validator: "Validador constitucional",
  marketing: "Marketing",
  assistant: "Asistente (chatbot)",
  showcase: "Showcase",
  dev: "Dev",
  design: "Design",
  analytics: "Analytics",
  finance: "Finance",
  legal: "Legal",
  support: "Support",
};

function labelFor(task: string): string {
  return TASK_LABEL[task] ?? task;
}

export function UsageSection() {
  const activeProjectId = useLoganStore((s) => s.activeProjectId);
  const { data: projects } = useProjects();
  const [filterProject, setFilterProject] = React.useState<string | null>(null);

  // If a project is active in the store, default the filter to it; otherwise
  // show global usage. User can toggle with the buttons.
  const effectiveProject =
    filterProject !== null ? filterProject : (activeProjectId ?? undefined);
  const usage = useLlmUsage(effectiveProject ?? undefined);

  const total = usage.data?.total;
  const byProject = usage.data?.byProject ?? [];
  const byModel = usage.data?.byModel ?? [];
  const byTask = usage.data?.byTask ?? [];
  const last30 = usage.data?.last30Days ?? [];
  const maxDay = Math.max(1, ...last30.map((d) => d.totalTokens));

  return (
    <section className="space-y-6" aria-labelledby="uso-title">
      <SectionHeading
        eyebrow="Facturación por proyecto"
        title="Uso LLM"
        icon="BarChart3"
        description="Tokens consumidos por proyecto en los últimos 30 días. Cada llamada a callLLM queda registrada con su modelo, task y tokens. Úsalo para facturar a tus clientes."
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => usage.refetch()}
            disabled={usage.isFetching}
          >
            <RefreshCw className={usage.isFetching ? "size-3.5 animate-spin" : "size-3.5"} />
            Actualizar
          </Button>
        }
      />

      {/* Filter buttons */}
      <div className="flex flex-wrap gap-2">
        <Button
          variant={effectiveProject === undefined ? "default" : "outline"}
          size="sm"
          onClick={() => setFilterProject(null)}
        >
          Todos los proyectos
        </Button>
        {activeProjectId && (
          <Button
            variant={effectiveProject === activeProjectId ? "default" : "outline"}
            size="sm"
            onClick={() => setFilterProject(activeProjectId)}
          >
            Solo proyecto activo
          </Button>
        )}
      </div>

      {usage.isLoading ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Cargando uso…
          </CardContent>
        </Card>
      ) : usage.isError ? (
        <EmptyState
          icon={<BarChart3 className="size-5" />}
          title="No se pudo cargar el uso"
          description={usage.error?.message ?? "Intenta de nuevo."}
        />
      ) : !total || total.calls === 0 ? (
        <EmptyState
          icon={<BarChart3 className="size-5" />}
          title="Sin datos de uso todavía"
          description="Cuando hables con LOGAN o ejecutes una capability de Marketing, las llamadas aparecerán aquí."
        />
      ) : (
        <>
          {/* Total card */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Total tokens</CardDescription>
                <CardTitle className="font-serif text-2xl">
                  {formatTokens(total.totalTokens)}
                </CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Prompt (entrada)</CardDescription>
                <CardTitle className="font-serif text-2xl">
                  {formatTokens(total.promptTokens)}
                </CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Completion (salida)</CardDescription>
                <CardTitle className="font-serif text-2xl">
                  {formatTokens(total.completionTokens)}
                </CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Llamadas</CardDescription>
                <CardTitle className="font-serif text-2xl">
                  {total.calls}
                </CardTitle>
              </CardHeader>
            </Card>
          </div>

          {/* Last 30 days bar chart (no chart library) */}
          <Card>
            <CardHeader>
              <CardTitle className="font-serif text-lg">
                Últimos 30 días
              </CardTitle>
              <CardDescription>
                Tokens consumidos por día. Cada barra representa un día.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex h-32 items-end gap-[2px]">
                {last30.map((d) => {
                  const h = d.totalTokens > 0 ? Math.max(2, (d.totalTokens / maxDay) * 100) : 0;
                  return (
                    <div
                      key={d.date}
                      className="flex-1 rounded-t-sm bg-primary/70 transition-all hover:bg-primary"
                      style={{ height: `${h}%` }}
                      title={`${d.date}: ${formatTokens(d.totalTokens)} tokens`}
                      aria-label={`${d.date}: ${d.totalTokens} tokens`}
                    />
                  );
                })}
              </div>
              <div className="mt-2 flex justify-between text-[10px] text-muted-foreground">
                <span>{last30[0]?.date ?? ""}</span>
                <span>{last30[last30.length - 1]?.date ?? ""}</span>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            {/* By project */}
            <Card>
              <CardHeader>
                <CardTitle className="font-serif text-lg">Por proyecto</CardTitle>
                <CardDescription>
                  Tokens totales por proyecto en los últimos 30 días.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {byProject.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Filtrado a un proyecto. Cambia a "Todos los proyectos" para
                    ver el desglose.
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Proyecto</TableHead>
                        <TableHead className="text-right">Tokens</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {byProject.slice(0, 12).map((p) => {
                        const known = projects?.find((pr) => pr.id === p.projectId);
                        return (
                          <TableRow key={p.projectId ?? "none"}>
                            <TableCell className="font-medium">
                              {known?.name ?? p.projectName}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {formatTokens(p.totalTokens)}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            {/* By model */}
            <Card>
              <CardHeader>
                <CardTitle className="font-serif text-lg">Por modelo</CardTitle>
                <CardDescription>
                  Distribución de tokens entre los modelos LLM.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Modelo</TableHead>
                      <TableHead className="text-right">Llamadas</TableHead>
                      <TableHead className="text-right">Tokens</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {byModel.map((m) => (
                      <TableRow key={m.model}>
                        <TableCell>
                          <Badge variant="outline" className="font-mono text-xs">
                            {m.model}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {m.calls}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatTokens(m.totalTokens)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>

          {/* By task */}
          <Card>
            <CardHeader>
              <CardTitle className="font-serif text-lg">Por task</CardTitle>
              <CardDescription>
                Distribución por tipo de llamada (Core, Marketing, validador, etc.).
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Task</TableHead>
                    <TableHead className="text-right">Llamadas</TableHead>
                    <TableHead className="text-right">Tokens</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {byTask.map((t) => (
                    <TableRow key={t.task}>
                      <TableCell className="font-medium">
                        {labelFor(t.task)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {t.calls}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatTokens(t.totalTokens)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </section>
  );
}
