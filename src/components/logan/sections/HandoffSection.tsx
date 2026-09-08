"use client";

// LOGAN OS — Handoff — panel del negocio (DEC-LOGAN-021).
//
// Muestra las conversaciones del proyecto, permite alternar el interruptor
// BOT/HUMANO por conversación, ver el historial y responder manualmente
// cuando está en modo HUMANO.

import * as React from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SectionHeading } from "@/components/logan/SectionHeading";
import { EmptyState } from "@/components/logan/EmptyState";
import { StatusPill, type StatusColor } from "@/components/logan/StatusPill";
import { useLoganStore } from "@/lib/store";
import {
  useConversations,
  useConversation,
  useSetMode,
  useHumanReply,
  type ConversationRow,
} from "@/lib/handoff/hooks";
import { toast } from "sonner";
import { Bot, User, Send, MessageSquare, Clock } from "lucide-react";

const STATUS_COLOR: Record<string, StatusColor> = {
  OPEN: "muted",
  WAITING_HUMAN: "warning",
  CLOSED: "success",
};
const STATUS_LABEL: Record<string, string> = {
  OPEN: "Abierta",
  WAITING_HUMAN: "Esperando humano",
  CLOSED: "Cerrada",
};

export function HandoffSection() {
  const activeId = useLoganStore((s) => s.activeProjectId);
  const list = useConversations(activeId);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const conversations = list.data ?? [];

  return (
    <section className="space-y-6" aria-labelledby="handoff-title">
      <SectionHeading
        eyebrow="Agente de IA · Handoff humano"
        title="Conversaciones"
        icon="MessageSquare"
        description="Controla el agente de IA de cada conversación. Actívalo para que responda solo, o apágalo para tomar el control y responder tú mismo. Funciona en el chat web (y próximamente en WhatsApp y redes)."
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,340px)_1fr]">
        {/* Lista de conversaciones */}
        <Card className="border-t-2 border-t-warning/40">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 font-serif text-lg">
              <MessageSquare className="size-5 text-warning" />
              Conversaciones
            </CardTitle>
            <CardDescription>
              {conversations.length} en total
              {conversations.some((c) => c.status === "WAITING_HUMAN") && (
                <span className="ml-2 text-warning">· hay clientes esperando</span>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {!activeId && (
              <EmptyState
                icon={<MessageSquare className="size-5" />}
                title="Selecciona un proyecto"
                description="Elige un proyecto para ver sus conversaciones."
              />
            )}
            {activeId && conversations.length === 0 && (
              <EmptyState
                icon={<MessageSquare className="size-5" />}
                title="Sin conversaciones aún"
                description="Cuando un cliente escriba por el chat, aparecerá aquí."
              />
            )}
            {conversations.map((c) => (
              <ConversationListItem
                key={c.id}
                conv={c}
                selected={c.id === selectedId}
                onClick={() => setSelectedId(c.id)}
              />
            ))}
          </CardContent>
        </Card>

        {/* Detalle de la conversación seleccionada */}
        <Card>
          <CardContent className="p-0">
            {selectedId ? (
              <ConversationDetail
                conversationId={selectedId}
                projectId={activeId}
              />
            ) : (
              <div className="p-8">
                <EmptyState
                  icon={<MessageSquare className="size-5" />}
                  title="Ninguna conversación abierta"
                  description="Selecciona una conversación de la izquierda para verla y responder."
                />
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </section>
  );
}

function ConversationListItem({
  conv,
  selected,
  onClick,
}: {
  conv: ConversationRow;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full rounded-lg border px-3 py-2.5 text-left transition-colors ${
        selected ? "border-warning/50 bg-warning/5" : "hover:bg-muted/40"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="truncate font-medium text-sm">{conv.externalId}</span>
        <StatusPill color={STATUS_COLOR[conv.status] ?? "muted"}>
          {STATUS_LABEL[conv.status] ?? conv.status}
        </StatusPill>
      </div>
      <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          {conv.mode === "BOT" ? (
            <>
              <Bot className="size-3" /> Agente activo
            </>
          ) : (
            <>
              <User className="size-3" /> Control humano
            </>
          )}
        </span>
        <span>·</span>
        <span className="uppercase">{conv.channel}</span>
      </div>
    </button>
  );
}

function ConversationDetail({
  conversationId,
  projectId,
}: {
  conversationId: string;
  projectId: string | null;
}) {
  const detail = useConversation(conversationId);
  const setMode = useSetMode(projectId);
  const reply = useHumanReply();
  const [text, setText] = React.useState("");
  const conv = detail.data;

  const isHuman = conv?.mode === "HUMAN";

  function toggleMode() {
    if (!conv) return;
    const next = conv.mode === "BOT" ? "HUMAN" : "BOT";
    setMode.mutate(
      { id: conv.id, mode: next },
      {
        onSuccess: () =>
          toast.success(
            next === "HUMAN"
              ? "Tomaste el control de la conversación"
              : "El agente de IA vuelve a responder",
          ),
        onError: (e) => toast.error(`No se pudo cambiar el modo: ${e.message}`),
      },
    );
  }

  function sendReply() {
    const t = text.trim();
    if (!t || !conv) return;
    reply.mutate(
      { id: conv.id, text: t },
      {
        onSuccess: () => setText(""),
        onError: (e) => toast.error(`No se pudo enviar: ${e.message}`),
      },
    );
  }

  if (!conv) {
    return <div className="p-8 text-sm text-muted-foreground">Cargando…</div>;
  }

  return (
    <div className="flex h-[560px] flex-col">
      {/* Cabecera con el interruptor */}
      <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
        <div>
          <p className="font-medium text-sm">{conv.externalId}</p>
          <p className="text-xs text-muted-foreground uppercase">
            {conv.channel}
          </p>
        </div>
        <Button
          variant={isHuman ? "default" : "outline"}
          size="sm"
          onClick={toggleMode}
          disabled={setMode.isPending}
          className="gap-1.5"
        >
          {isHuman ? (
            <>
              <Bot className="size-4" /> Devolver al agente
            </>
          ) : (
            <>
              <User className="size-4" /> Tomar control
            </>
          )}
        </Button>
      </div>

      {/* Historial */}
      <div className="flex-1 space-y-3 overflow-y-auto p-4 logan-scroll">
        {conv.messages.length === 0 && (
          <p className="text-sm text-muted-foreground">Sin mensajes aún.</p>
        )}
        {conv.messages.map((m) => {
          const mine = m.sender !== "CUSTOMER";
          return (
            <div
              key={m.id}
              className={`flex ${mine ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm ${
                  m.sender === "CUSTOMER"
                    ? "bg-muted text-foreground"
                    : m.sender === "BOT"
                      ? "bg-primary/10 text-foreground ring-1 ring-primary/20"
                      : "bg-warning/15 text-foreground ring-1 ring-warning/30"
                }`}
              >
                <div className="mb-0.5 flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                  {m.sender === "CUSTOMER" && "Cliente"}
                  {m.sender === "BOT" && (
                    <>
                      <Bot className="size-3" /> Agente
                    </>
                  )}
                  {m.sender === "HUMAN" && (
                    <>
                      <User className="size-3" /> Tú
                    </>
                  )}
                </div>
                {m.content}
              </div>
            </div>
          );
        })}
      </div>

      {/* Caja de respuesta humana */}
      <div className="border-t p-3">
        {isHuman ? (
          <div className="flex items-center gap-2">
            <Input
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") sendReply();
              }}
              placeholder="Escribe tu respuesta…"
              disabled={reply.isPending}
            />
            <Button
              size="sm"
              onClick={sendReply}
              disabled={reply.isPending || !text.trim()}
              className="gap-1.5"
            >
              <Send className="size-4" /> Enviar
            </Button>
          </div>
        ) : (
          <p className="flex items-center justify-center gap-2 py-1 text-xs text-muted-foreground">
            <Clock className="size-3.5" />
            El agente de IA está respondiendo. Pulsa “Tomar control” para
            responder tú mismo.
          </p>
        )}
      </div>
    </div>
  );
}
