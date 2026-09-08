"use client";

// LOGAN OS — Panel del cliente (DEC-LOGAN-022, Fases 3.1–3.5).
//
// Componente compartido usado por:
//   - /panel/[projectId]         (acceso por id)
//   - /panel/by-slug/[slug]      (acceso por subdominio {slug}.loganos.com)
//
// Recibe el projectId ya resuelto. Muestra login si no hay sesión; si la hay,
// muestra SOLO las conversaciones de ese proyecto + el handoff bot/humano.
// Usa los endpoints /api/handoff/client/* que aíslan por projectId.

import * as React from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Bot, User, Send, MessageSquare, LogOut, Clock } from "lucide-react";

type Conversation = {
  id: string;
  channel: string;
  externalId: string;
  mode: "BOT" | "HUMAN";
  status: string;
  lastCustomerMessageAt: string;
};
type Message = {
  id: string;
  sender: "CUSTOMER" | "BOT" | "HUMAN";
  content: string;
  createdAt: string;
};

export function ClientPanel({ projectId }: { projectId: string }) {
  const [authed, setAuthed] = React.useState<boolean | null>(null);

  React.useEffect(() => {
    api(`/api/handoff/client/conversations?projectId=${projectId}`)
      .then(() => setAuthed(true))
      .catch(() => setAuthed(false));
  }, [projectId]);

  if (authed === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[oklch(0.12_0.008_60)] text-[oklch(0.85_0.012_75)]">
        Cargando…
      </div>
    );
  }

  return authed ? (
    <PanelInner projectId={projectId} onLogout={() => setAuthed(false)} />
  ) : (
    <LoginForm projectId={projectId} onSuccess={() => setAuthed(true)} />
  );
}

function LoginForm({
  projectId,
  onSuccess,
}: {
  projectId: string;
  onSuccess: () => void;
}) {
  const [password, setPassword] = React.useState("");
  const [loading, setLoading] = React.useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await api("/api/handoff/client-login", {
        method: "POST",
        body: JSON.stringify({ projectId, password }),
      });
      onSuccess();
    } catch {
      toast.error("Contraseña incorrecta o acceso no disponible");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[oklch(0.10_0.006_60)] px-4">
      <form
        onSubmit={submit}
        className="w-full max-w-sm rounded-2xl border border-[oklch(0.28_0.012_60/55%)] bg-[oklch(0.14_0.008_60)] p-8"
      >
        <div className="mb-6 flex items-center gap-3">
          <img src="/logo.svg" alt="LOGAN" width={40} height={40} className="size-10" />
          <div>
            <p className="font-serif text-lg text-[oklch(0.93_0.012_75)]">Panel de atención</p>
            <p className="text-xs text-[oklch(0.65_0.012_70)]">Ingresa para atender a tus clientes</p>
          </div>
        </div>
        <label className="mb-2 block text-sm text-[oklch(0.78_0.012_72)]">Contraseña</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mb-4 w-full rounded-lg border border-[oklch(0.32_0.012_60/60%)] bg-[oklch(0.10_0.006_60)] px-3 py-2 text-[oklch(0.93_0.012_75)] outline-none focus:border-[oklch(0.78_0.16_65)]"
          placeholder="••••••••"
          autoFocus
        />
        <button
          type="submit"
          disabled={loading || !password}
          className="w-full rounded-lg bg-gradient-to-br from-[oklch(0.78_0.16_65)] to-[oklch(0.62_0.13_35)] px-4 py-2 font-medium text-[oklch(0.16_0.008_60)] disabled:opacity-50"
        >
          {loading ? "Entrando…" : "Entrar"}
        </button>
      </form>
    </div>
  );
}

function PanelInner({
  projectId,
  onLogout,
}: {
  projectId: string;
  onLogout: () => void;
}) {
  const [conversations, setConversations] = React.useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);

  React.useEffect(() => {
    let alive = true;
    const load = () =>
      api<{ conversations: Conversation[] }>(
        `/api/handoff/client/conversations?projectId=${projectId}`,
      )
        .then((r) => alive && setConversations(r.conversations))
        .catch(() => {});
    load();
    const t = setInterval(load, 5000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [projectId]);

  async function logout() {
    try {
      await api(`/api/handoff/client-login?projectId=${projectId}`, { method: "DELETE" });
    } catch {}
    onLogout();
  }

  return (
    <div className="flex min-h-screen flex-col bg-[oklch(0.10_0.006_60)] text-[oklch(0.9_0.012_75)]">
      <header className="flex items-center justify-between border-b border-[oklch(0.28_0.012_60/55%)] px-4 py-3">
        <div className="flex items-center gap-2">
          <img src="/logo.svg" alt="LOGAN" width={32} height={32} className="size-8" />
          <span className="font-serif text-lg">Atención a clientes</span>
        </div>
        <button
          onClick={logout}
          className="inline-flex items-center gap-1.5 text-xs text-[oklch(0.65_0.012_70)] hover:text-[oklch(0.85_0.16_65)]"
        >
          <LogOut className="size-4" /> Salir
        </button>
      </header>

      <div className="grid flex-1 gap-4 p-4 lg:grid-cols-[minmax(0,320px)_1fr]">
        <div className="space-y-2 rounded-xl border border-[oklch(0.28_0.012_60/55%)] p-3">
          <p className="mb-2 flex items-center gap-2 text-sm text-[oklch(0.78_0.012_72)]">
            <MessageSquare className="size-4 text-[oklch(0.85_0.16_65)]" />
            {conversations.length} conversaciones
          </p>
          {conversations.length === 0 && (
            <p className="py-8 text-center text-sm text-[oklch(0.6_0.012_70)]">
              Aún no hay conversaciones.
            </p>
          )}
          {conversations.map((c) => (
            <button
              key={c.id}
              onClick={() => setSelectedId(c.id)}
              className={`w-full rounded-lg border px-3 py-2 text-left text-sm ${
                c.id === selectedId
                  ? "border-[oklch(0.78_0.16_65/50%)] bg-[oklch(0.78_0.16_65/8%)]"
                  : "border-transparent hover:bg-[oklch(0.18_0.012_60/50%)]"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="truncate">{c.externalId}</span>
                {c.status === "WAITING_HUMAN" && (
                  <span className="rounded-full bg-[oklch(0.78_0.16_65/20%)] px-1.5 py-0.5 text-[10px] text-[oklch(0.85_0.16_65)]">
                    esperando
                  </span>
                )}
              </div>
              <span className="text-xs text-[oklch(0.6_0.012_70)]">
                {c.mode === "BOT" ? "Agente activo" : "Control humano"} · {c.channel}
              </span>
            </button>
          ))}
        </div>

        <div className="rounded-xl border border-[oklch(0.28_0.012_60/55%)]">
          {selectedId ? (
            <ClientConversation projectId={projectId} conversationId={selectedId} />
          ) : (
            <div className="flex h-full min-h-[400px] items-center justify-center text-sm text-[oklch(0.6_0.012_70)]">
              Selecciona una conversación
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ClientConversation({
  projectId,
  conversationId,
}: {
  projectId: string;
  conversationId: string;
}) {
  const [conv, setConv] = React.useState<
    (Conversation & { messages: Message[] }) | null
  >(null);
  const [text, setText] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const load = React.useCallback(() => {
    api<{ conversation: Conversation & { messages: Message[] } }>(
      `/api/handoff/client/conversations/${conversationId}?projectId=${projectId}`,
    )
      .then((r) => setConv(r.conversation))
      .catch(() => {});
  }, [conversationId, projectId]);

  React.useEffect(() => {
    load();
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [load]);

  async function toggleMode() {
    if (!conv) return;
    const next = conv.mode === "BOT" ? "HUMAN" : "BOT";
    setBusy(true);
    try {
      await api(`/api/handoff/client/conversations/${conversationId}`, {
        method: "PATCH",
        body: JSON.stringify({ projectId, mode: next }),
      });
      toast.success(next === "HUMAN" ? "Tomaste el control" : "El agente vuelve a responder");
      load();
    } catch {
      toast.error("No se pudo cambiar el modo");
    } finally {
      setBusy(false);
    }
  }

  async function send() {
    const t = text.trim();
    if (!t) return;
    setBusy(true);
    try {
      const res = await api<{ delivered?: boolean; warning?: string }>(
        `/api/handoff/client/conversations/${conversationId}/reply`,
        {
          method: "POST",
          body: JSON.stringify({ projectId, text: t }),
        },
      );
      setText("");
      load();
      // El mensaje se guarda siempre; si WhatsApp no lo entregó, avisamos.
      if (res && res.delivered === false && res.warning) {
        toast.warning(res.warning);
      }
    } catch (e) {
      toast.error(`No se pudo enviar: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  if (!conv) return <div className="p-8 text-sm text-[oklch(0.6_0.012_70)]">Cargando…</div>;

  const isHuman = conv.mode === "HUMAN";

  return (
    <div className="flex h-[560px] flex-col">
      <div className="flex items-center justify-between border-b border-[oklch(0.28_0.012_60/55%)] px-4 py-3">
        <div>
          <p className="text-sm font-medium">{conv.externalId}</p>
          <p className="text-xs uppercase text-[oklch(0.6_0.012_70)]">{conv.channel}</p>
        </div>
        <button
          onClick={toggleMode}
          disabled={busy}
          className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm ${
            isHuman
              ? "bg-gradient-to-br from-[oklch(0.78_0.16_65)] to-[oklch(0.62_0.13_35)] text-[oklch(0.16_0.008_60)]"
              : "border border-[oklch(0.32_0.012_60/60%)] text-[oklch(0.85_0.012_75)]"
          }`}
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
        </button>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {conv.messages.map((m) => {
          const mine = m.sender !== "CUSTOMER";
          return (
            <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm ${
                  m.sender === "CUSTOMER"
                    ? "bg-[oklch(0.2_0.012_60)]"
                    : m.sender === "BOT"
                      ? "bg-[oklch(0.78_0.16_65/12%)] ring-1 ring-[oklch(0.78_0.16_65/25%)]"
                      : "bg-[oklch(0.78_0.16_65/20%)] ring-1 ring-[oklch(0.78_0.16_65/35%)]"
                }`}
              >
                <div className="mb-0.5 text-[10px] uppercase text-[oklch(0.6_0.012_70)]">
                  {m.sender === "CUSTOMER" ? "Cliente" : m.sender === "BOT" ? "Agente" : "Tú"}
                </div>
                {m.content}
              </div>
            </div>
          );
        })}
      </div>

      <div className="border-t border-[oklch(0.28_0.012_60/55%)] p-3">
        {isHuman ? (
          <div className="flex items-center gap-2">
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send()}
              placeholder="Escribe tu respuesta…"
              disabled={busy}
              className="flex-1 rounded-lg border border-[oklch(0.32_0.012_60/60%)] bg-[oklch(0.10_0.006_60)] px-3 py-2 text-sm outline-none focus:border-[oklch(0.78_0.16_65)]"
            />
            <button
              onClick={send}
              disabled={busy || !text.trim()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-br from-[oklch(0.78_0.16_65)] to-[oklch(0.62_0.13_35)] px-3 py-2 text-sm text-[oklch(0.16_0.008_60)] disabled:opacity-50"
            >
              <Send className="size-4" /> Enviar
            </button>
          </div>
        ) : (
          <p className="flex items-center justify-center gap-2 py-1 text-xs text-[oklch(0.6_0.012_70)]">
            <Clock className="size-3.5" /> El agente está respondiendo. Pulsa “Tomar control” para responder tú.
          </p>
        )}
      </div>
    </div>
  );
}
